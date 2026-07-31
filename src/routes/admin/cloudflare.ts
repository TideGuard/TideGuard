import { ApiError, jsonOk } from "../../core/errors";
import { requireAdminSession } from "../../auth/operator";
import { appendAuditEvent } from "../../admin/audit-store";
import {
  BypassConfigError,
  readBypassSettings,
  toBypassPublicView,
  writeCloudflareLink,
  readCloudflareApiToken,
} from "../../admin/bypass-store";
import { clearGeoBlockSettings } from "../../admin/geo-block-store";
import {
  attachWorkerDomain,
  checkHostnameProxy,
  CloudflareApiError,
  detachWorkerDomain,
  enableHostnameProxy,
  findZoneIdByHostname,
  getIpGeolocation,
  listWorkerDomains,
  setIpGeolocation,
  setSslMode,
  verifyCloudflareAccess,
} from "../../admin/cloudflare-api";
import { formatCloudflareOperatorError } from "../../admin/operator-errors";
import { clientConnectingIp, hasConnectingIpHeader } from "../../auth/client-ip";
import { readJsonBody } from "../validation";
import { requireSavedCloudflare } from "./helpers";

export async function handleAdminSaveCloudflare(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const body = await readJsonBody(request);

  try {
    const payload: {
      zoneId: string | null;
      hostname: string | null;
      apiToken?: string | null;
      clearApiToken?: boolean;
      accountId?: string | null;
      workerService?: string | null;
    } = {
      zoneId: typeof body.zoneId === "string" ? body.zoneId : null,
      hostname: typeof body.hostname === "string" ? body.hostname : null,
    };
    if (typeof body.workerService === "string") {
      payload.workerService = body.workerService;
    }
    if (body.clearApiToken === true) {
      payload.clearApiToken = true;
    } else if (typeof body.apiToken === "string" && body.apiToken.trim()) {
      payload.apiToken = body.apiToken;
      let zoneId = (payload.zoneId || "").trim();
      const hostname = (payload.hostname || "").trim() || new URL(request.url).hostname;
      if (!zoneId && hostname) {
        const found = await findZoneIdByHostname(body.apiToken.trim(), hostname);
        if (found) {
          zoneId = found;
          payload.zoneId = found;
        }
      }
      if (!zoneId) {
        throw new BypassConfigError("zoneId is required to verify the API token");
      }
      const verified = await verifyCloudflareAccess({
        apiToken: body.apiToken.trim(),
        zoneId,
        hostname,
        ...(typeof body.workerService === "string" ? { workerService: body.workerService } : {}),
      });
      payload.accountId = verified.zone.accountId;
      payload.zoneId = verified.zone.zoneId;
    }
    const settings = await writeCloudflareLink(env, payload);
    const clientIp = clientConnectingIp(request);
    await appendAuditEvent(env, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: payload.clearApiToken ? "cloudflare.token_clear" : "cloudflare.link",
      summary: payload.clearApiToken
        ? "Cleared Cloudflare API token"
        : "Updated Cloudflare zone access settings",
    });
    return jsonOk({
      ok: true,
      bypass: toBypassPublicView(settings, {
        clientIp,
        connectingIpPresent: hasConnectingIpHeader(request),
      }),
    });
  } catch (error) {
    if (error instanceof BypassConfigError) {
      throw new ApiError("bad_request", error.message, 400);
    }
    if (error instanceof CloudflareApiError) {
      throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
    }
    throw error;
  }
}

export async function handleAdminCloudflareCheck(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  return runCloudflareProxyAction(request, env, "check");
}

export async function handleAdminCloudflareFixProxy(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const response = await runCloudflareProxyAction(request, env, "fix");
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "cloudflare.fix_proxy",
    summary: "Ran Cloudflare Fix setup (proxy + IP Geolocation)",
  });
  return response;
}

async function runCloudflareProxyAction(
  request: Request,
  env: Env,
  action: "check" | "fix",
): Promise<Response> {
  const settings = await readBypassSettings(env);
  const body = await readJsonBody(request).catch(() => ({}) as Record<string, unknown>);

  const zoneId = (typeof body.zoneId === "string" && body.zoneId.trim()) || settings.zoneId || "";
  const hostname =
    (typeof body.hostname === "string" && body.hostname.trim()) ||
    settings.hostname ||
    new URL(request.url).hostname;

  if (!zoneId) {
    throw new ApiError(
      "bad_request",
      "zoneId is required (from the Cloudflare overview page)",
      400,
    );
  }

  const apiToken = await readCloudflareApiToken(env);
  if (!apiToken) {
    throw new ApiError(
      "bad_request",
      "Save a Cloudflare API token first (Zone DNS Edit, Zone Read, Zone Settings Edit)",
      400,
    );
  }

  try {
    const result =
      action === "fix"
        ? await enableHostnameProxy({ apiToken, zoneId, hostname })
        : await checkHostnameProxy({ apiToken, zoneId, hostname });
    return jsonOk({ ok: result.ok, check: result });
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
    }
    throw error;
  }
}

export async function handleAdminCloudflareIpGeolocation(
  request: Request,
  env: Env,
): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const body = await readJsonBody(request);
  const enabled = body.enabled === true;
  const { apiToken, zoneId } = await requireSavedCloudflare(env);

  try {
    await setIpGeolocation(apiToken, zoneId, enabled ? "on" : "off");
    if (!enabled) {
      await clearGeoBlockSettings(env);
    }
    const setting = await getIpGeolocation(apiToken, zoneId);
    const on = setting.value === true || setting.value === "on";
    await appendAuditEvent(env, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: "cloudflare.ip_geolocation",
      summary: on
        ? "Enabled IP Geolocation (CF-IPCountry)"
        : "Disabled IP Geolocation and cleared country block",
      meta: { enabled: on },
    });
    return jsonOk({ ok: true, ipGeolocation: { on } });
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
    }
    throw error;
  }
}

export async function handleAdminCloudflareSsl(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const { apiToken, zoneId } = await requireSavedCloudflare(env);

  try {
    const ssl = await setSslMode(apiToken, zoneId, "strict");
    await appendAuditEvent(env, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: "cloudflare.ssl",
      summary: "Set SSL/TLS encryption mode to Full (strict)",
    });
    return jsonOk({ ok: true, ssl });
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
    }
    throw error;
  }
}

export async function handleAdminCloudflareDomains(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const settings = await readBypassSettings(env);
  const { apiToken, zoneId, accountId, workerService } = await requireSavedCloudflare(env, {
    needAccount: true,
  });

  if (request.method === "GET") {
    try {
      const domains = await listWorkerDomains({
        apiToken,
        accountId: accountId!,
        service: workerService,
      });
      return jsonOk({ ok: true, domains, workerService });
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
      }
      throw error;
    }
  }

  if (request.method === "PUT") {
    const body = await readJsonBody(request);
    const hostname =
      (typeof body.hostname === "string" && body.hostname.trim()) || settings.hostname || "";
    if (!hostname) {
      throw new ApiError("bad_request", "hostname is required", 400);
    }
    try {
      const domain = await attachWorkerDomain({
        apiToken,
        accountId: accountId!,
        hostname,
        service: workerService,
        zoneId,
      });
      if (!settings.hostname) {
        await writeCloudflareLink(env, {
          zoneId: settings.zoneId,
          hostname,
          accountId,
          workerService,
        });
      }
      await appendAuditEvent(env, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: "cloudflare.domain_attach",
        summary: `Attached custom domain ${hostname}`,
        meta: { hostname },
      });
      return jsonOk({ ok: true, domain });
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
      }
      throw error;
    }
  }

  if (request.method === "DELETE") {
    const body = await readJsonBody(request);
    const domainId = typeof body.domainId === "string" ? body.domainId.trim() : "";
    if (!domainId) {
      throw new ApiError("bad_request", "domainId is required", 400);
    }
    try {
      await detachWorkerDomain({
        apiToken,
        accountId: accountId!,
        domainId,
      });
      await appendAuditEvent(env, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: "cloudflare.domain_detach",
        summary: `Detached custom domain ${domainId}`,
        meta: { domainId },
      });
      return jsonOk({ ok: true });
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
      }
      throw error;
    }
  }

  throw new ApiError("bad_request", "Method not allowed", 405);
}
