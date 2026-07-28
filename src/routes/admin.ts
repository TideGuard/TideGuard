import { parseAdmissionMode } from "../core/config";
import { ApiError, jsonOk } from "../core/errors";
import { DEFAULT_BRANDING, type WaitingRoomBranding } from "../core/branding";
import type { AdmissionMode } from "../core/types";
import { hashPassword, verifyPassword } from "../auth/password";
import { signAdminSession } from "../auth/admin-session";
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
  rememberQueue,
  sanitizeBrandingInput,
  writeAdminConfig,
  writeBranding,
} from "../admin/store";
import {
  clearOriginOverride,
  resolveOriginConfig,
  writeOriginOverride,
} from "../admin/origin-store";
import { normalizeOriginUrl, parsePathPrefixes } from "../core/origin";
import { renderAdminApp } from "../html/admin";
import { configFromEnv, getQueueRoom } from "../queue/client";
import { parseOptionalCount, parseQueueName, readJsonBody } from "./validation";

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
  const setupComplete = await isAdminSetupComplete(env);
  const admin = setupComplete ? await readAdminConfig(env) : null;
  const defaultQueue = admin?.defaultQueue || env.DEFAULT_QUEUE || "default";
  const queues = setupComplete ? await rememberQueue(env, defaultQueue) : [defaultQueue];
  return jsonOk({
    setupComplete,
    defaultQueue,
    queues,
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
  await rememberQueue(env, queue);
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
  const queues = await rememberQueue(env, queue);
  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  const [branding, metrics, origin, health] = await Promise.all([
    readBranding(env, queue),
    room.metrics({ queue, config }),
    resolveOriginConfig(env),
    room.getHealth(),
  ]);

  return jsonOk({
    queue,
    queues,
    defaultQueue: admin.defaultQueue,
    branding,
    metrics,
    admissionMode: metrics.admissionMode as AdmissionMode,
    origin,
    traffic: {
      opensAt: metrics.opensAt,
      paused: metrics.paused,
      health: metrics.health,
      effectiveAdmitPerSecond: metrics.effectiveAdmitPerSecond,
      healthConfig: health.config,
    },
  });
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
  await rememberQueue(env, queue);

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

  await rememberQueue(env, queue);
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
  return jsonOk({ ok: true, setupComplete: false });
}

export async function handleAdminAdmit(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const count = parseOptionalCount(body.count, 1);
  await rememberQueue(env, queue);

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  const result = await room.forceAdmit({ queue, config, count });
  return jsonOk(result);
}

export async function handleAdminCapacity(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  await rememberQueue(env, queue);

  const maxConcurrentUsers =
    body.maxConcurrentUsers === undefined || body.maxConcurrentUsers === null
      ? undefined
      : parseCapacity(body.maxConcurrentUsers);
  const admitPerSecond =
    body.admitPerSecond === undefined || body.admitPerSecond === null
      ? undefined
      : parseAdmitRate(body.admitPerSecond);

  if (maxConcurrentUsers === undefined && admitPerSecond === undefined) {
    throw new ApiError("bad_request", "Provide maxConcurrentUsers and/or admitPerSecond", 400);
  }

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  return jsonOk(
    await room.setCapacity({
      queue,
      config,
      ...(maxConcurrentUsers !== undefined ? { maxConcurrentUsers } : {}),
      ...(admitPerSecond !== undefined ? { admitPerSecond } : {}),
    }),
  );
}

export async function handleAdminPassword(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "password"), { limit: 10, windowMs: 60_000 });
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const currentPassword = parsePassword(body.currentPassword);
  const newPassword = parsePassword(body.newPassword);
  const confirm = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  if (newPassword !== confirm) {
    throw new ApiError("bad_request", "Passwords do not match", 400);
  }
  if (currentPassword === newPassword) {
    throw new ApiError("bad_request", "New password must differ from the current password", 400);
  }

  const ok = await verifyPassword(currentPassword, admin.passwordHash, admin.passwordSalt);
  if (!ok) {
    throw new ApiError("unauthorized", "Current password is incorrect", 401);
  }

  const { hash, salt } = await hashPassword(newPassword);
  await writeAdminConfig(env, {
    ...admin,
    passwordHash: hash,
    passwordSalt: salt,
  });

  const session = await signAdminSession(requireTokenSecret(env));
  return withCookie(jsonOk({ ok: true }), buildAdminSessionCookie(session, request));
}

export async function handleAdminDefaultQueue(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const queues = await rememberQueue(env, queue);
  await writeAdminConfig(env, { ...admin, defaultQueue: queue });
  return jsonOk({ ok: true, defaultQueue: queue, queues });
}

function parseCapacity(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100_000) {
    throw new ApiError(
      "bad_request",
      "maxConcurrentUsers must be an integer between 1 and 100000",
      400,
    );
  }
  return n;
}

function parseAdmitRate(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!(n > 0) || !Number.isFinite(n) || n > 1_000) {
    throw new ApiError(
      "bad_request",
      "admitPerSecond must be a number between 0 and 1000 (exclusive of 0)",
      400,
    );
  }
  return n;
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
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
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
