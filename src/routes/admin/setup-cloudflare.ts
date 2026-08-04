import { ApiError, jsonOk } from "../../core/errors";
import { rateLimitOrThrow } from "../../auth";
import {
  attachWorkerDomain,
  createTurnstileWidget,
  enableHostnameProxy,
  findZoneIdByHostname,
  listWorkerDomains,
  setSslMode,
  turnstileDomainsForHostname,
  verifyApiToken,
  verifyCloudflareAccess,
  verifyTurnstileToken,
} from "../../admin/cloudflare-api";
import {
  rethrowCloudflareAsApiError,
  formatTurnstileOperatorError,
} from "../../admin/operator-errors";
import {
  markSetupPendingTurnstileVerified,
  openSetupPendingApiToken,
  openSetupPendingTurnstileSecret,
  readSetupPending,
  toSetupPendingPublic,
  writeSetupPendingApiToken,
  writeSetupPendingCloudflare,
  writeSetupPendingTurnstile,
  SetupPendingError,
} from "../../admin/setup-pending-store";
import { clientConnectingIp } from "../../auth/client-ip";
import { readJsonBody } from "../validation";
import { clientKey, requireSetupWizardSession } from "./helpers";

export async function handleAdminSetupCloudflareTokenVerify(
  request: Request,
  env: Env,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-cf-token"), { limit: 20, windowMs: 60_000 });
  await requireSetupWizardSession(request, env);

  const body = await readJsonBody(request);
  const apiToken = typeof body.apiToken === "string" ? body.apiToken.trim() : "";
  if (apiToken.length < 20) {
    throw new ApiError(
      "bad_request",
      "Cloudflare API token looks too short or empty. Paste the token from API Tokens → Create Custom Token.",
      400,
    );
  }

  try {
    const verified = await verifyApiToken(apiToken);
    const pending = await writeSetupPendingApiToken(env, apiToken);
    return jsonOk({
      ok: true,
      status: verified.status,
      id: verified.id,
      pending: toSetupPendingPublic(pending),
    });
  } catch (error) {
    rethrowCloudflareAsApiError(error);
  }
}

export async function handleAdminSetupCloudflareVerify(
  request: Request,
  env: Env,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-cf-verify"), { limit: 20, windowMs: 60_000 });
  await requireSetupWizardSession(request, env);

  const body = await readJsonBody(request);
  let apiToken = typeof body.apiToken === "string" ? body.apiToken.trim() : "";
  if (!apiToken) {
    apiToken = (await openSetupPendingApiToken(env)) ?? "";
  }
  let zoneId = typeof body.zoneId === "string" ? body.zoneId.trim() : "";
  const hostname =
    (typeof body.hostname === "string" && body.hostname.trim()) || new URL(request.url).hostname;
  const workerService =
    typeof body.workerService === "string" && body.workerService.trim()
      ? body.workerService.trim()
      : "tideguard";

  if (apiToken.length < 20) {
    throw new ApiError(
      "bad_request",
      "Cloudflare API token missing — verify the token in the previous step first.",
      400,
    );
  }

  try {
    if (!zoneId) {
      const found = await findZoneIdByHostname(apiToken, hostname);
      if (!found) {
        throw new ApiError(
          "bad_request",
          "Could not resolve Zone ID from hostname. Paste the Zone ID from the zone Overview, or check the hostname spelling.",
          400,
        );
      }
      zoneId = found;
    }

    const verified = await verifyCloudflareAccess({
      apiToken,
      zoneId,
      hostname,
      workerService,
    });

    const pending = await writeSetupPendingCloudflare(env, {
      zoneId: verified.zone.zoneId,
      hostname,
      accountId: verified.zone.accountId,
      workerService,
      apiToken,
      proxyOk: verified.proxy.ok,
      sslMode: verified.ssl.mode,
      sslIsStrict: verified.ssl.isStrict,
      hostnameAttached: verified.domains.hostnameAttached,
    });

    return jsonOk({
      ok: verified.proxy.ok,
      verify: verified,
      pending: toSetupPendingPublic(pending),
    });
  } catch (error) {
    rethrowCloudflareAsApiError(error);
  }
}

export async function handleAdminSetupCloudflareFix(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-cf-fix"), { limit: 20, windowMs: 60_000 });
  await requireSetupWizardSession(request, env);

  const pending = await readSetupPending(env);
  const apiToken = await openSetupPendingApiToken(env);
  if (!pending.cloudflare || !apiToken) {
    throw new ApiError("bad_request", "Verify Cloudflare access first", 400);
  }

  try {
    const check = await enableHostnameProxy({
      apiToken,
      zoneId: pending.cloudflare.zoneId,
      hostname: pending.cloudflare.hostname,
    });
    const domains = await listWorkerDomains({
      apiToken,
      accountId: pending.cloudflare.accountId,
      service: pending.cloudflare.workerService,
    }).catch(() => []);
    const hostnameAttached = domains.some(
      (d) => d.hostname.toLowerCase() === pending.cloudflare!.hostname.toLowerCase(),
    );
    const next = await writeSetupPendingCloudflare(env, {
      zoneId: pending.cloudflare.zoneId,
      hostname: pending.cloudflare.hostname,
      accountId: pending.cloudflare.accountId,
      workerService: pending.cloudflare.workerService,
      apiToken,
      proxyOk: check.ok,
      sslMode: pending.cloudflare.sslMode,
      sslIsStrict: pending.cloudflare.sslIsStrict,
      hostnameAttached,
    });
    return jsonOk({ ok: check.ok, check, pending: toSetupPendingPublic(next) });
  } catch (error) {
    rethrowCloudflareAsApiError(error);
  }
}

export async function handleAdminSetupTurnstileProvision(
  request: Request,
  env: Env,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-ts-provision"), { limit: 10, windowMs: 60_000 });
  await requireSetupWizardSession(request, env);

  const pending = await readSetupPending(env);
  const apiToken = await openSetupPendingApiToken(env);
  if (!pending.cloudflare?.proxyOk || !apiToken) {
    throw new ApiError(
      "bad_request",
      "Verify Cloudflare access first (proxied DNS must pass) before creating Turnstile.",
      400,
    );
  }

  // Reuse existing pending widget if already provisioned.
  if (pending.turnstile?.sitekey) {
    return jsonOk({
      ok: true,
      sitekey: pending.turnstile.sitekey,
      pending: toSetupPendingPublic(pending),
    });
  }

  const domains = turnstileDomainsForHostname(pending.cloudflare.hostname);
  try {
    const widget = await createTurnstileWidget({
      apiToken,
      accountId: pending.cloudflare.accountId,
      name: "TideGuard Admin",
      domains,
      mode: "managed",
    });
    const next = await writeSetupPendingTurnstile(env, {
      sitekey: widget.sitekey,
      secret: widget.secret,
      domains: widget.domains.length > 0 ? widget.domains : domains,
      accountId: pending.cloudflare.accountId,
      verified: false,
    });
    return jsonOk({
      ok: true,
      sitekey: widget.sitekey,
      pending: toSetupPendingPublic(next),
    });
  } catch (error) {
    if (error instanceof SetupPendingError) {
      throw new ApiError("bad_request", error.message, 400);
    }
    rethrowCloudflareAsApiError(error);
  }
}

export async function handleAdminSetupTurnstileVerify(
  request: Request,
  env: Env,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-ts-verify"), { limit: 20, windowMs: 60_000 });
  await requireSetupWizardSession(request, env);

  const body = await readJsonBody(request);
  const token =
    typeof body.turnstileToken === "string"
      ? body.turnstileToken
      : typeof body["cf-turnstile-response"] === "string"
        ? body["cf-turnstile-response"]
        : "";
  const secret = await openSetupPendingTurnstileSecret(env);
  const pending = await readSetupPending(env);
  if (!secret || !pending.turnstile) {
    throw new ApiError(
      "bad_request",
      "Create the Turnstile widget first, then complete the challenge and Click to verify.",
      400,
    );
  }

  const result = await verifyTurnstileToken({
    secret,
    token,
    remoteip: clientConnectingIp(request),
  });
  if (!result.success) {
    throw new ApiError("bad_request", formatTurnstileOperatorError(result.errorCodes), 400);
  }

  const next = await markSetupPendingTurnstileVerified(env);
  return jsonOk({ ok: true, pending: toSetupPendingPublic(next) });
}

export async function handleAdminSetupCloudflareAttachDomain(
  request: Request,
  env: Env,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-cf-domain"), { limit: 10, windowMs: 60_000 });
  await requireSetupWizardSession(request, env);

  const pending = await readSetupPending(env);
  const apiToken = await openSetupPendingApiToken(env);
  if (!pending.cloudflare || !apiToken) {
    throw new ApiError("bad_request", "Verify Cloudflare access first", 400);
  }

  try {
    await attachWorkerDomain({
      apiToken,
      accountId: pending.cloudflare.accountId,
      hostname: pending.cloudflare.hostname,
      service: pending.cloudflare.workerService,
      zoneId: pending.cloudflare.zoneId,
    });
    const next = await writeSetupPendingCloudflare(env, {
      zoneId: pending.cloudflare.zoneId,
      hostname: pending.cloudflare.hostname,
      accountId: pending.cloudflare.accountId,
      workerService: pending.cloudflare.workerService,
      apiToken,
      proxyOk: pending.cloudflare.proxyOk,
      sslMode: pending.cloudflare.sslMode,
      sslIsStrict: pending.cloudflare.sslIsStrict,
      hostnameAttached: true,
    });
    return jsonOk({ ok: true, pending: toSetupPendingPublic(next) });
  } catch (error) {
    rethrowCloudflareAsApiError(error);
  }
}

export async function handleAdminSetupCloudflareSsl(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-cf-ssl"), { limit: 10, windowMs: 60_000 });
  await requireSetupWizardSession(request, env);

  const pending = await readSetupPending(env);
  const apiToken = await openSetupPendingApiToken(env);
  if (!pending.cloudflare || !apiToken) {
    throw new ApiError("bad_request", "Verify Cloudflare access first", 400);
  }

  try {
    const ssl = await setSslMode(apiToken, pending.cloudflare.zoneId, "strict");
    const next = await writeSetupPendingCloudflare(env, {
      zoneId: pending.cloudflare.zoneId,
      hostname: pending.cloudflare.hostname,
      accountId: pending.cloudflare.accountId,
      workerService: pending.cloudflare.workerService,
      apiToken,
      proxyOk: pending.cloudflare.proxyOk,
      sslMode: ssl.mode,
      sslIsStrict: ssl.isStrict,
      hostnameAttached: pending.cloudflare.hostnameAttached,
    });
    return jsonOk({ ok: true, ssl, pending: toSetupPendingPublic(next) });
  } catch (error) {
    rethrowCloudflareAsApiError(error);
  }
}
