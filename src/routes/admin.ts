import { parseAdmissionMode } from "../core/config";
import { ApiError, jsonOk } from "../core/errors";
import { DEFAULT_BRANDING, sanitizeRedirectUrl, type WaitingRoomBranding } from "../core/branding";
import type { AdmissionMode } from "../core/types";
import { hashPassword, verifyPassword } from "../auth/password";
import { assertAdminPassword } from "../auth/password-policy";
import { signAdminSession } from "../auth/admin-session";
import { buildAccessCookie, buildAdmissionClaims, signAccessToken } from "../auth";
import {
  buildAdminSessionCookie,
  clearAdminSessionCookie,
  requireAdminSession,
  requireTokenSecret,
} from "../auth/operator";
import { rateLimitOrThrow, withSecurityHeaders } from "../auth";
import {
  addAdminUser,
  clearAdminConfig,
  findUserByUsername,
  isAdminSetupComplete,
  newAdminUserId,
  readAdminConfig,
  readBranding,
  sanitizeBrandingInput,
  writeAdminConfig,
  writeBranding,
} from "../admin/store";
import { appendAuditEvent, clearAuditLog, readAuditEvents } from "../admin/audit-store";
import {
  InviteError,
  clearAllInvites,
  consumeInvite,
  createInvite,
  listInvites,
  revokeInvite,
  toPublicInvite,
} from "../admin/invite-store";
import { validateUsername } from "../admin/types";
import {
  clearOriginOverride,
  resolveOriginConfig,
  writeOriginOverride,
} from "../admin/origin-store";
import {
  BypassConfigError,
  clearBypassSettings,
  readBypassSettings,
  toBypassPublicView,
  writeAllowlist,
  writeCloudflareLink,
  readCloudflareApiToken,
} from "../admin/bypass-store";
import {
  clearGeoBlockSettings,
  effectiveBlockedCountries,
  GeoBlockConfigError,
  readGeoBlockSettings,
  toGeoBlockPublicView,
  writeGeoBlockSettings,
} from "../admin/geo-block-store";
import {
  clearGeoBlockStats,
  readGeoBlockStats,
  resetGeoBlockStatsWindow,
  toGeoBlockStatsPublic,
} from "../admin/geo-block-stats";
import {
  attachWorkerDomain,
  checkHostnameProxy,
  CloudflareApiError,
  createTurnstileWidget,
  detachWorkerDomain,
  enableHostnameProxy,
  findZoneIdByHostname,
  getIpGeolocation,
  listWorkerDomains,
  setIpGeolocation,
  setSslMode,
  turnstileDomainsForHostname,
  verifyCloudflareAccess,
  verifyTurnstileToken,
} from "../admin/cloudflare-api";
import {
  formatCloudflareOperatorError,
  formatTurnstileOperatorError,
} from "../admin/operator-errors";
import {
  clearSetupPending,
  isSetupPendingReady,
  markSetupPendingTurnstileVerified,
  openSetupPendingApiToken,
  openSetupPendingTurnstileSecret,
  readSetupPending,
  toSetupPendingPublic,
  writeSetupPendingCloudflare,
  writeSetupPendingTurnstile,
  SetupPendingError,
} from "../admin/setup-pending-store";
import {
  clearTurnstileSettings,
  readTurnstileSecret,
  readTurnstileSettings,
  toTurnstilePublicView,
  writeTurnstileSettings,
} from "../admin/turnstile-store";
import { clientConnectingIp, hasConnectingIpHeader } from "../auth/client-ip";
import { clientCountryCode, isCountryBlocked } from "../auth/geo-country";
import { normalizeOriginUrl, parsePathPrefixes } from "../core/origin";
import { checkForUpdates, UPDATE_CHECK_CACHE_KEY } from "../admin/update-check";
import { renderAdminApp } from "../html/admin";
import { configFromEnv, getQueueRoom } from "../queue/client";
import { VERSION } from "../version";
import { parseQueueName, readJsonBody } from "./validation";

export async function handleAdminPage(_request: Request, env: Env): Promise<Response> {
  const setupComplete = await isAdminSetupComplete(env);
  const html = renderAdminApp({
    setupComplete,
    defaultQueue: env.DEFAULT_QUEUE || "default",
    defaultBranding: DEFAULT_BRANDING,
    version: VERSION,
  });
  return withSecurityHeaders(
    new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }),
  );
}

export async function handleAdminBootstrap(_request: Request, env: Env): Promise<Response> {
  const setupComplete = await isAdminSetupComplete(env);
  const turnstile = await readTurnstileSettings(env);
  const pending = setupComplete ? null : await readSetupPending(env);
  return jsonOk({
    setupComplete,
    defaultQueue: env.DEFAULT_QUEUE || "default",
    version: VERSION,
    turnstileSitekey: turnstile?.sitekey ?? pending?.turnstile?.sitekey ?? null,
    setupPending: pending ? toSetupPendingPublic(pending) : null,
  });
}

export async function handleAdminSetup(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup"), { limit: 10, windowMs: 60_000 });

  if (await isAdminSetupComplete(env)) {
    throw new ApiError("conflict", "Admin setup is already complete", 409);
  }

  // First-time setup requires TOKEN_SECRET so a stranger cannot claim the Worker.
  requireSetupBearer(request, env);

  const body = await readJsonBody(request);
  let username: string;
  try {
    username = validateUsername(typeof body.username === "string" ? body.username : "");
  } catch (error) {
    throw new ApiError(
      "bad_request",
      error instanceof Error ? error.message : "Invalid username",
      400,
    );
  }
  let password: string;
  try {
    password = assertAdminPassword(body.password, body.confirmPassword);
  } catch (error) {
    throw new ApiError(
      "bad_request",
      error instanceof Error ? error.message : "Invalid password",
      400,
    );
  }
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE);
  const mode = parseAdmissionMode(body.admissionMode ?? "queue");
  if (!mode) {
    throw new ApiError("bad_request", 'admissionMode must be "queue" or "lottery"', 400);
  }

  const branding = sanitizeBrandingInput(
    body.branding && typeof body.branding === "object"
      ? (body.branding as Partial<WaitingRoomBranding>)
      : undefined,
  );

  const pending = await readSetupPending(env);
  if (!isSetupPendingReady(pending) || !pending.cloudflare || !pending.turnstile) {
    throw new ApiError(
      "bad_request",
      "Finish Cloudflare verify (proxied DNS) and Turnstile verify before completing setup.",
      400,
    );
  }

  const apiToken = await openSetupPendingApiToken(env);
  const turnstileSecret = await openSetupPendingTurnstileSecret(env);
  if (!apiToken || !turnstileSecret) {
    throw new ApiError(
      "bad_request",
      "Setup pending secrets are missing; re-verify Cloudflare",
      400,
    );
  }

  const { hash, salt } = await hashPassword(password);
  const userId = newAdminUserId();
  const now = Date.now();
  await writeAdminConfig(env, {
    setupComplete: true,
    users: [
      {
        id: userId,
        username,
        passwordHash: hash,
        passwordSalt: salt,
        createdAt: now,
      },
    ],
    createdAt: now,
    defaultQueue: queue,
  });
  await writeBranding(env, queue, branding);
  await writeCloudflareLink(env, {
    zoneId: pending.cloudflare.zoneId,
    hostname: pending.cloudflare.hostname,
    apiToken,
    accountId: pending.cloudflare.accountId,
    workerService: pending.cloudflare.workerService,
  });
  await writeTurnstileSettings(env, {
    sitekey: pending.turnstile.sitekey,
    secret: turnstileSecret,
    accountId: pending.turnstile.accountId,
    domains: pending.turnstile.domains,
  });
  await clearSetupPending(env);

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  await room.setMode({ queue, config, mode });
  await room.setAdmitUx({
    queue,
    config,
    requireClickToEnter: branding.requireClickToEnter,
    admitHoldSeconds: branding.admitHoldSeconds,
    showWaitingCount: branding.showWaitingCount,
  });

  const actor = { id: userId, username };
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "setup.complete",
    summary: `First admin “${username}” claimed the Worker`,
  });

  const session = await signAdminSession(requireTokenSecret(env), actor);
  return withCookie(
    jsonOk({ ok: true, queue, admissionMode: mode, username }),
    buildAdminSessionCookie(session, request),
  );
}

export async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "login"), { limit: 20, windowMs: 60_000 });

  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  await requireTurnstileResponse(request, env, body);

  const usernameRaw = typeof body.username === "string" ? body.username : "";
  // Legacy installs / UI may omit username → treat as "admin".
  const username = usernameRaw.trim() ? usernameRaw : "admin";
  const user = findUserByUsername(admin, username);
  if (!user) {
    throw new ApiError("unauthorized", "Invalid username or password", 401);
  }
  const password = parsePassword(body.password);
  const ok = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!ok) {
    throw new ApiError("unauthorized", "Invalid username or password", 401);
  }

  const actor = { id: user.id, username: user.username };
  const session = await signAdminSession(requireTokenSecret(env), actor);
  return withCookie(
    jsonOk({ ok: true, queue: admin.defaultQueue, username: user.username }),
    buildAdminSessionCookie(session, request),
  );
}

export async function handleAdminLogout(request: Request, _env: Env): Promise<Response> {
  return withCookie(jsonOk({ ok: true }), clearAdminSessionCookie(request));
}

export async function handleAdminState(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const queue = parseQueueName(
    new URL(request.url).searchParams.get("queue") ?? admin.defaultQueue,
    admin.defaultQueue,
  );
  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  const [
    branding,
    metrics,
    origin,
    health,
    bypassSettings,
    geoSettings,
    geoStats,
    invites,
    turnstile,
  ] = await Promise.all([
    readBranding(env, queue),
    room.metrics({ queue, config }),
    resolveOriginConfig(env),
    room.getHealth(),
    readBypassSettings(env),
    readGeoBlockSettings(env),
    readGeoBlockStats(env),
    listInvites(env),
    readTurnstileSettings(env),
  ]);

  const clientIp = clientConnectingIp(request);
  const clientCountry = clientCountryCode(request);
  const blockedCountries = effectiveBlockedCountries(geoSettings);
  return jsonOk({
    queue,
    branding,
    metrics,
    admissionMode: metrics.admissionMode as AdmissionMode,
    origin,
    bypass: toBypassPublicView(bypassSettings, {
      clientIp,
      connectingIpPresent: hasConnectingIpHeader(request),
    }),
    geoBlock: toGeoBlockPublicView(geoSettings, {
      clientCountry,
      clientBlocked: isCountryBlocked(clientCountry, blockedCountries),
      stats: toGeoBlockStatsPublic(geoStats),
    }),
    turnstile: toTurnstilePublicView(turnstile),
    traffic: {
      opensAt: metrics.opensAt,
      paused: metrics.paused,
      health: metrics.health,
      effectiveAdmitPerSecond: metrics.effectiveAdmitPerSecond,
      healthConfig: health.config,
    },
    version: VERSION,
    me: { id: actor.id, username: actor.username },
    team: {
      users: admin.users.map((u) => ({
        id: u.id,
        username: u.username,
        createdAt: u.createdAt,
      })),
      invites: invites.map(toPublicInvite),
    },
  });
}

/** Compare running VERSION to GitHub releases/latest (KV-cached). */
export async function handleAdminUpdates(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  rateLimitOrThrow(clientKey(request, "updates"), { limit: 30, windowMs: 60_000 });
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  const result = await checkForUpdates(env, { force });
  return jsonOk(result);
}

export async function handleAdminAudit(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const events = await readAuditEvents(env);
  return jsonOk({ events });
}

export async function handleAdminListInvites(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const invites = await listInvites(env);
  return jsonOk({ invites: invites.map(toPublicInvite) });
}

export async function handleAdminCreateInvite(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  rateLimitOrThrow(clientKey(request, "invite-create"), { limit: 20, windowMs: 60_000 });
  const { invite, token, acceptPath } = await createInvite(env, actor);
  const acceptUrl = new URL(acceptPath, request.url).toString();
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "invite.create",
    summary: `Created admin invite (expires ${new Date(invite.expiresAt).toISOString()})`,
    meta: { inviteId: invite.id },
  });
  return jsonOk({
    ok: true,
    invite: toPublicInvite(invite),
    token: `${invite.id}.${token}`,
    acceptUrl,
  });
}

export async function handleAdminRevokeInvite(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const id = new URL(request.url).pathname.split("/").pop() || "";
  if (!id || id === "invites") {
    throw new ApiError("bad_request", "Invite id required", 400);
  }
  const removed = await revokeInvite(env, id);
  if (!removed) {
    throw new ApiError("not_found", "Invite not found", 404);
  }
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "invite.revoke",
    summary: `Revoked admin invite ${id}`,
    meta: { inviteId: id },
  });
  return jsonOk({ ok: true });
}

export async function handleAdminAcceptInvite(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "invite-accept"), { limit: 20, windowMs: 60_000 });

  if (!(await isAdminSetupComplete(env))) {
    throw new ApiError("bad_request", "Finish first-time setup before accepting invites", 400);
  }

  const body = await readJsonBody(request);
  await requireTurnstileResponse(request, env, body);
  const rawToken = typeof body.token === "string" ? body.token : "";
  let username: string;
  try {
    username = validateUsername(typeof body.username === "string" ? body.username : "");
  } catch (error) {
    throw new ApiError(
      "bad_request",
      error instanceof Error ? error.message : "Invalid username",
      400,
    );
  }
  let password: string;
  try {
    password = assertAdminPassword(body.password, body.confirmPassword);
  } catch (error) {
    throw new ApiError(
      "bad_request",
      error instanceof Error ? error.message : "Invalid password",
      400,
    );
  }

  let invite;
  try {
    invite = await consumeInvite(env, rawToken);
  } catch (error) {
    if (error instanceof InviteError) {
      throw new ApiError("bad_request", error.message, 400);
    }
    throw error;
  }

  const { hash, salt } = await hashPassword(password);
  const userId = newAdminUserId();
  try {
    await addAdminUser(env, {
      id: userId,
      username,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: Date.now(),
    });
  } catch (error) {
    throw new ApiError(
      "bad_request",
      error instanceof Error ? error.message : "Could not add user",
      400,
    );
  }

  const actor = { id: userId, username };
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "invite.accept",
    summary: `“${username}” joined via invite from ${invite.createdByUsername}`,
    meta: { inviteId: invite.id },
  });

  const admin = await readAdminConfig(env);
  const session = await signAdminSession(requireTokenSecret(env), actor);
  return withCookie(
    jsonOk({ ok: true, username, queue: admin?.defaultQueue ?? "default" }),
    buildAdminSessionCookie(session, request),
  );
}

export async function handleAdminSaveBypass(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const body = await readJsonBody(request);
  const text =
    typeof body.allowlistText === "string"
      ? body.allowlistText
      : Array.isArray(body.allowlist)
        ? body.allowlist.filter((v): v is string => typeof v === "string").join("\n")
        : "";

  try {
    const settings = await writeAllowlist(env, text);
    const clientIp = clientConnectingIp(request);
    await appendAuditEvent(env, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: "bypass.allowlist",
      summary: "Updated IP allowlist",
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
    throw error;
  }
}

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

export async function handleAdminMetrics(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const queue = parseQueueName(
    new URL(request.url).searchParams.get("queue") ?? admin.defaultQueue,
    admin.defaultQueue,
  );
  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  const [metrics, geoSettings, geoStats] = await Promise.all([
    room.metrics({ queue, config }),
    readGeoBlockSettings(env),
    readGeoBlockStats(env),
  ]);
  const clientCountry = clientCountryCode(request);
  const blockedCountries = effectiveBlockedCountries(geoSettings);
  return jsonOk({
    ok: true,
    metrics,
    geoBlock: toGeoBlockPublicView(geoSettings, {
      clientCountry,
      clientBlocked: isCountryBlocked(clientCountry, blockedCountries),
      stats: toGeoBlockStatsPublic(geoStats),
    }),
    refreshedAt: Date.now(),
  });
}

/**
 * Issue an admission cookie for this admin browser and skip the waiting room.
 * Does not join the Durable Object queue or consume a concurrent slot.
 */
export async function handleAdminPass(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const [branding, origin] = await Promise.all([
    readBranding(env, queue),
    resolveOriginConfig(env),
  ]);
  const fallback = branding.redirectUrl || (origin.enabled ? "/" : "/demo");
  const redirectTo =
    sanitizeRedirectUrl(typeof body.returnTo === "string" ? body.returnTo : "", fallback) ||
    fallback;

  const config = configFromEnv(env);
  const secret = requireTokenSecret(env);
  const visitorId = `admin_pass_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const accessToken = await signAccessToken(
    buildAdmissionClaims({
      visitorId,
      queue,
      tokenTTLSeconds: config.tokenTTLSeconds,
    }),
    secret,
  );

  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "pass.issue",
    summary: `Issued Pass queue admission for queue “${queue}”`,
    meta: { queue },
  });

  return withCookie(
    jsonOk({ ok: true, redirectTo, visitorId, queue }),
    buildAccessCookie(accessToken, request, config.tokenTTLSeconds),
  );
}

export async function handleAdminSaveGeoBlock(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const body = await readJsonBody(request);
  const enabled = body.enabled === true || body.enabled === "true";
  const countriesText =
    typeof body.countriesText === "string"
      ? body.countriesText
      : Array.isArray(body.countries)
        ? body.countries.filter((v): v is string => typeof v === "string").join("\n")
        : "";

  try {
    const settings = await writeGeoBlockSettings(env, {
      enabled,
      countriesText,
      ttlHours:
        body.ttlHours === undefined || body.ttlHours === null || body.ttlHours === ""
          ? null
          : Number(body.ttlHours),
      expiresAt:
        typeof body.expiresAt === "number" && Number.isFinite(body.expiresAt)
          ? body.expiresAt
          : null,
    });
    const stats = enabled ? await resetGeoBlockStatsWindow(env) : await readGeoBlockStats(env);
    const clientCountry = clientCountryCode(request);
    await appendAuditEvent(env, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: enabled ? "geo.enable" : "geo.disable",
      summary: enabled ? "Enabled country block" : "Disabled country block",
    });
    return jsonOk({
      ok: true,
      geoBlock: toGeoBlockPublicView(settings, {
        clientCountry,
        clientBlocked: isCountryBlocked(clientCountry, effectiveBlockedCountries(settings)),
        stats: toGeoBlockStatsPublic(stats),
      }),
    });
  } catch (error) {
    if (error instanceof GeoBlockConfigError) {
      throw new ApiError("bad_request", error.message, 400);
    }
    throw error;
  }
}

export async function handleAdminSaveBranding(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const branding = sanitizeBrandingInput(
    body.branding && typeof body.branding === "object"
      ? (body.branding as Partial<WaitingRoomBranding>)
      : body,
  );
  await writeBranding(env, queue, branding);

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  await room.setAdmitUx({
    queue,
    config,
    requireClickToEnter: branding.requireClickToEnter,
    admitHoldSeconds: branding.admitHoldSeconds,
    showWaitingCount: branding.showWaitingCount,
  });

  return jsonOk({ ok: true, queue, branding });
}

export async function handleAdminSaveOrigin(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const enabled = body.enabled === true || body.enabled === "true";
  const originUrlRaw = typeof body.originUrl === "string" ? body.originUrl.trim() : "";
  const originUrl = originUrlRaw ? normalizeOriginUrl(originUrlRaw) : null;

  if (enabled && !originUrl) {
    throw new ApiError(
      "bad_request",
      "originUrl must be a public absolute http(s) URL (private/loopback hosts are blocked)",
      400,
    );
  }

  const protectAll =
    body.protectAll === undefined ? true : body.protectAll === true || body.protectAll === "true";
  const pathPrefixes =
    typeof body.pathPrefixes === "string"
      ? parsePathPrefixes(body.pathPrefixes)
      : Array.isArray(body.pathPrefixes)
        ? parsePathPrefixes(body.pathPrefixes.filter((p) => typeof p === "string").join(","))
        : [];
  const queue = parseQueueName(body.queue, admin.defaultQueue);

  const origin = await writeOriginOverride(env, {
    enabled,
    originUrl,
    protectAll,
    pathPrefixes,
    queue,
  });

  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: enabled ? "origin.enable" : "origin.disable",
    summary: enabled ? "Enabled origin proxy" : "Disabled origin proxy",
    meta: { enabled, protectAll },
  });

  return jsonOk({ ok: true, origin });
}

export async function handleAdminSetMode(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const mode = parseAdmissionMode(body.mode);
  if (!mode) {
    throw new ApiError("bad_request", 'mode must be "queue" or "lottery"', 400);
  }

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  const result = await room.setMode({ queue, config, mode });
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "mode.set",
    summary: `Set admission mode to ${mode}`,
    meta: { queue, mode },
  });
  return jsonOk(result);
}

export async function handleAdminPause(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const paused = body.paused === true || body.paused === "true";
  const room = getQueueRoom(env, queue);
  const result = await room.setPaused(paused);
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: paused ? "pause.on" : "pause.off",
    summary: paused ? "Enabled silent pause" : "Cleared silent pause",
    meta: { queue },
  });
  return jsonOk(result);
}

export async function handleAdminSchedule(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  let opensAt: number | null = null;
  if (body.opensAt !== null && body.opensAt !== undefined && body.opensAt !== "") {
    if (typeof body.opensAt === "number" && Number.isFinite(body.opensAt)) {
      opensAt = body.opensAt;
    } else if (typeof body.opensAt === "string") {
      const parsed = Date.parse(body.opensAt);
      if (!Number.isFinite(parsed)) {
        throw new ApiError("bad_request", "opensAt must be an ISO datetime or unix ms", 400);
      }
      opensAt = parsed;
    } else {
      throw new ApiError("bad_request", "opensAt must be an ISO datetime, unix ms, or null", 400);
    }
  }

  const room = getQueueRoom(env, queue);
  const result = await room.setOpensAt(opensAt);
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: opensAt === null ? "schedule.clear" : "schedule.set",
    summary: opensAt === null ? "Opened the room now" : "Set opening time",
    meta: { queue, opensAt },
  });
  return jsonOk(result);
}

export async function handleAdminHealth(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);

  if (body.overrideMinutes !== undefined) {
    const minutes = Number(body.overrideMinutes);
    if (!Number.isFinite(minutes) || minutes < 1) {
      throw new ApiError("bad_request", "overrideMinutes must be >= 1", 400);
    }
    const result = await room.overrideHealth(minutes);
    await appendAuditEvent(env, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: "health.override",
      summary: `Ignored origin health for ${minutes}m`,
      meta: { queue, minutes },
    });
    return jsonOk(result);
  }

  if (body.clearOverride === true) {
    const result = await room.clearHealthOverride();
    await appendAuditEvent(env, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: "health.override_clear",
      summary: "Cleared origin health override",
      meta: { queue },
    });
    return jsonOk(result);
  }

  const healthInput =
    body.health && typeof body.health === "object"
      ? (body.health as Record<string, unknown>)
      : body;

  const enabled = healthInput.enabled === true || healthInput.enabled === "true";
  const result = await room.setHealthConfig({
    queue,
    config,
    health: {
      enabled,
      url: typeof healthInput.url === "string" ? healthInput.url : null,
      intervalSeconds: Number(healthInput.intervalSeconds),
      timeoutMs: Number(healthInput.timeoutMs),
      maxLatencyMs: Number(healthInput.maxLatencyMs),
      expectStatus: Number(healthInput.expectStatus),
      failThreshold: Number(healthInput.failThreshold),
      recoverThreshold: Number(healthInput.recoverThreshold),
      slowRateMultiplier: Number(healthInput.slowRateMultiplier),
    },
  });
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "health.config",
    summary: enabled
      ? "Updated origin health throttle (enabled)"
      : "Updated origin health throttle (disabled)",
    meta: { queue },
  });
  return jsonOk(result);
}

/** Emergency reset: TOKEN_SECRET bearer only (not session). Clears admin + origin override. */
export async function handleAdminReset(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "reset"), { limit: 10, windowMs: 60_000 });
  requireSetupBearer(request, env);

  await clearAdminConfig(env);
  await clearOriginOverride(env);
  await clearBypassSettings(env);
  await clearGeoBlockSettings(env);
  await clearGeoBlockStats(env);
  await clearAllInvites(env);
  await clearAuditLog(env);
  await clearTurnstileSettings(env);
  await clearSetupPending(env);
  await env.CONFIG_KV.delete(UPDATE_CHECK_CACHE_KEY);
  return jsonOk({ ok: true, setupComplete: false });
}

export async function handleAdminSetupCloudflareVerify(
  request: Request,
  env: Env,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-cf-verify"), { limit: 20, windowMs: 60_000 });
  requireSetupBearer(request, env);
  if (await isAdminSetupComplete(env)) {
    throw new ApiError("conflict", "Admin setup is already complete", 409);
  }

  const body = await readJsonBody(request);
  const apiToken = typeof body.apiToken === "string" ? body.apiToken.trim() : "";
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
      "Cloudflare API token looks too short or empty. Paste the token from API Tokens → Create Custom Token.",
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
    if (error instanceof CloudflareApiError) {
      throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
    }
    throw error;
  }
}

export async function handleAdminSetupCloudflareFix(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-cf-fix"), { limit: 20, windowMs: 60_000 });
  requireSetupBearer(request, env);
  if (await isAdminSetupComplete(env)) {
    throw new ApiError("conflict", "Admin setup is already complete", 409);
  }

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
    if (error instanceof CloudflareApiError) {
      throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
    }
    throw error;
  }
}

export async function handleAdminSetupTurnstileProvision(
  request: Request,
  env: Env,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-ts-provision"), { limit: 10, windowMs: 60_000 });
  requireSetupBearer(request, env);
  if (await isAdminSetupComplete(env)) {
    throw new ApiError("conflict", "Admin setup is already complete", 409);
  }

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
    if (error instanceof CloudflareApiError) {
      throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
    }
    if (error instanceof SetupPendingError) {
      throw new ApiError("bad_request", error.message, 400);
    }
    throw error;
  }
}

export async function handleAdminSetupTurnstileVerify(
  request: Request,
  env: Env,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-ts-verify"), { limit: 20, windowMs: 60_000 });
  requireSetupBearer(request, env);
  if (await isAdminSetupComplete(env)) {
    throw new ApiError("conflict", "Admin setup is already complete", 409);
  }

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

export async function handleAdminSetupCloudflareAttachDomain(
  request: Request,
  env: Env,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-cf-domain"), { limit: 10, windowMs: 60_000 });
  requireSetupBearer(request, env);
  if (await isAdminSetupComplete(env)) {
    throw new ApiError("conflict", "Admin setup is already complete", 409);
  }

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
    if (error instanceof CloudflareApiError) {
      throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
    }
    throw error;
  }
}

export async function handleAdminSetupCloudflareSsl(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup-cf-ssl"), { limit: 10, windowMs: 60_000 });
  requireSetupBearer(request, env);
  if (await isAdminSetupComplete(env)) {
    throw new ApiError("conflict", "Admin setup is already complete", 409);
  }

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
    if (error instanceof CloudflareApiError) {
      throw new ApiError("bad_request", formatCloudflareOperatorError(error), 400);
    }
    throw error;
  }
}

function requireSetupBearer(request: Request, env: Env): void {
  const secret = requireTokenSecret(env);
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  if (!bearer || !timingSafeStringEqualSync(bearer, secret)) {
    throw new ApiError(
      "unauthorized",
      "Paste your TOKEN_SECRET as Authorization Bearer (same value as in .dev.vars / Wrangler secrets).",
      401,
    );
  }
}

async function requireTurnstileResponse(
  request: Request,
  env: Env,
  body: Record<string, unknown>,
): Promise<void> {
  const settings = await readTurnstileSettings(env);
  if (!settings) {
    return;
  }
  const secret = await readTurnstileSecret(env);
  if (!secret) {
    throw new ApiError("unauthorized", "Turnstile is misconfigured", 401);
  }
  const token =
    typeof body.turnstileToken === "string"
      ? body.turnstileToken
      : typeof body["cf-turnstile-response"] === "string"
        ? body["cf-turnstile-response"]
        : "";
  const result = await verifyTurnstileToken({
    secret,
    token,
    remoteip: clientConnectingIp(request),
  });
  if (!result.success) {
    throw new ApiError("unauthorized", formatTurnstileOperatorError(result.errorCodes), 401);
  }
}

async function requireSavedCloudflare(
  env: Env,
  options?: { needAccount?: boolean },
): Promise<{
  apiToken: string;
  zoneId: string;
  accountId: string | null;
  workerService: string;
}> {
  const settings = await readBypassSettings(env);
  const apiToken = await readCloudflareApiToken(env);
  if (!apiToken) {
    throw new ApiError("bad_request", "Save a Cloudflare API token first", 400);
  }
  if (!settings.zoneId) {
    throw new ApiError("bad_request", "zoneId is required", 400);
  }
  if (options?.needAccount && !settings.accountId) {
    throw new ApiError(
      "bad_request",
      "Account id missing — re-save Cloudflare access to refresh zone metadata",
      400,
    );
  }
  return {
    apiToken,
    zoneId: settings.zoneId,
    accountId: settings.accountId,
    workerService: settings.workerService || "tideguard",
  };
}

function clientKey(request: Request, action: string): string {
  const ip = clientConnectingIp(request) || "unknown";
  return `${action}:${ip}`;
}

function parsePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new ApiError("bad_request", "password must be 8–128 characters", 400);
  }
  return value;
}

function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function timingSafeStringEqualSync(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}
