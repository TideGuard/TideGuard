import { parseAdmissionMode } from "../core/config";
import { ApiError, jsonOk } from "../core/errors";
import { DEFAULT_BRANDING, sanitizeRedirectUrl, type WaitingRoomBranding } from "../core/branding";
import type { AdmissionMode } from "../core/types";
import { hashPassword, verifyPassword } from "../auth/password";
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
  clearAdminConfig,
  isAdminSetupComplete,
  readAdminConfig,
  readBranding,
  sanitizeBrandingInput,
  writeAdminConfig,
  writeBranding,
} from "../admin/store";
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
  checkHostnameProxy,
  CloudflareApiError,
  enableHostnameProxy,
} from "../admin/cloudflare-api";
import { clientConnectingIp, hasConnectingIpHeader } from "../auth/client-ip";
import { clientCountryCode, isCountryBlocked } from "../auth/geo-country";
import { normalizeOriginUrl, parsePathPrefixes } from "../core/origin";
import { renderAdminApp } from "../html/admin";
import { configFromEnv, getQueueRoom } from "../queue/client";
import { parseQueueName, readJsonBody } from "./validation";

export async function handleAdminPage(_request: Request, env: Env): Promise<Response> {
  const setupComplete = await isAdminSetupComplete(env);
  const html = renderAdminApp({
    setupComplete,
    defaultQueue: env.DEFAULT_QUEUE || "default",
    defaultBranding: DEFAULT_BRANDING,
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
  return jsonOk({
    setupComplete: await isAdminSetupComplete(env),
    defaultQueue: env.DEFAULT_QUEUE || "default",
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
  const password = parsePassword(body.password);
  const confirm = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  if (password !== confirm) {
    throw new ApiError("bad_request", "Passwords do not match", 400);
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

  const { hash, salt } = await hashPassword(password);
  await writeAdminConfig(env, {
    setupComplete: true,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: Date.now(),
    defaultQueue: queue,
  });
  await writeBranding(env, queue, branding);

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

  const session = await signAdminSession(requireTokenSecret(env));
  return withCookie(
    jsonOk({ ok: true, queue, admissionMode: mode }),
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
  const password = parsePassword(body.password);
  const ok = await verifyPassword(password, admin.passwordHash, admin.passwordSalt);
  if (!ok) {
    throw new ApiError("unauthorized", "Invalid password", 401);
  }

  const session = await signAdminSession(requireTokenSecret(env));
  return withCookie(
    jsonOk({ ok: true, queue: admin.defaultQueue }),
    buildAdminSessionCookie(session, request),
  );
}

export async function handleAdminLogout(request: Request, _env: Env): Promise<Response> {
  return withCookie(jsonOk({ ok: true }), clearAdminSessionCookie(request));
}

export async function handleAdminState(request: Request, env: Env): Promise<Response> {
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
  const [branding, metrics, origin, health, bypassSettings, geoSettings, geoStats] =
    await Promise.all([
      readBranding(env, queue),
      room.metrics({ queue, config }),
      resolveOriginConfig(env),
      room.getHealth(),
      readBypassSettings(env),
      readGeoBlockSettings(env),
      readGeoBlockStats(env),
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
    traffic: {
      opensAt: metrics.opensAt,
      paused: metrics.paused,
      health: metrics.health,
      effectiveAdmitPerSecond: metrics.effectiveAdmitPerSecond,
      healthConfig: health.config,
    },
  });
}

export async function handleAdminSaveBypass(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
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
  await requireAdminSession(request, env);
  const body = await readJsonBody(request);

  try {
    const payload: {
      zoneId: string | null;
      hostname: string | null;
      apiToken?: string | null;
      clearApiToken?: boolean;
    } = {
      zoneId: typeof body.zoneId === "string" ? body.zoneId : null,
      hostname: typeof body.hostname === "string" ? body.hostname : null,
    };
    if (body.clearApiToken === true) {
      payload.clearApiToken = true;
    } else if (typeof body.apiToken === "string") {
      payload.apiToken = body.apiToken;
    }
    const settings = await writeCloudflareLink(env, payload);
    const clientIp = clientConnectingIp(request);
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

export async function handleAdminCloudflareCheck(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  return runCloudflareProxyAction(request, env, "check");
}

export async function handleAdminCloudflareFixProxy(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  return runCloudflareProxyAction(request, env, "fix");
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
      throw new ApiError("bad_request", error.message, 400);
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
  await requireAdminSession(request, env);
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

  return withCookie(
    jsonOk({ ok: true, redirectTo, visitorId, queue }),
    buildAccessCookie(accessToken, request, config.tokenTTLSeconds),
  );
}

export async function handleAdminSaveGeoBlock(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
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
  await requireAdminSession(request, env);
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

  return jsonOk({ ok: true, origin });
}

export async function handleAdminSetMode(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
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
  return jsonOk(await room.setMode({ queue, config, mode }));
}

export async function handleAdminPause(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const paused = body.paused === true || body.paused === "true";
  const room = getQueueRoom(env, queue);
  return jsonOk(await room.setPaused(paused));
}

export async function handleAdminSchedule(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
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
  return jsonOk(await room.setOpensAt(opensAt));
}

export async function handleAdminHealth(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
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
    return jsonOk(await room.overrideHealth(minutes));
  }

  if (body.clearOverride === true) {
    return jsonOk(await room.clearHealthOverride());
  }

  const healthInput =
    body.health && typeof body.health === "object"
      ? (body.health as Record<string, unknown>)
      : body;

  return jsonOk(
    await room.setHealthConfig({
      queue,
      config,
      health: {
        enabled: healthInput.enabled === true || healthInput.enabled === "true",
        url: typeof healthInput.url === "string" ? healthInput.url : null,
        intervalSeconds: Number(healthInput.intervalSeconds),
        timeoutMs: Number(healthInput.timeoutMs),
        maxLatencyMs: Number(healthInput.maxLatencyMs),
        expectStatus: Number(healthInput.expectStatus),
        failThreshold: Number(healthInput.failThreshold),
        recoverThreshold: Number(healthInput.recoverThreshold),
        slowRateMultiplier: Number(healthInput.slowRateMultiplier),
      },
    }),
  );
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
  return jsonOk({ ok: true, setupComplete: false });
}

function requireSetupBearer(request: Request, env: Env): void {
  const secret = requireTokenSecret(env);
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  if (!bearer || !timingSafeStringEqualSync(bearer, secret)) {
    throw new ApiError(
      "unauthorized",
      "Authorization: Bearer TOKEN_SECRET is required for this action",
      401,
    );
  }
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
