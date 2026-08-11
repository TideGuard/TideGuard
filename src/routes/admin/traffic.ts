import {
  DEFAULT_MISSED_SLOT_GRACE_SECONDS,
  MAX_MISSED_SLOT_GRACE_SECONDS,
  MIN_MISSED_SLOT_GRACE_SECONDS,
  parseAdmissionMode,
} from "../../core/config";
import { ApiError, jsonOk } from "../../core/errors";
import { sanitizeRedirectUrl } from "../../core/branding";
import { buildAccessCookie, buildAdmissionClaims, signAccessToken } from "../../auth";
import { requireAdminSession, requireTokenSecret } from "../../auth/operator";
import { rateLimitOrThrow } from "../../auth";
import { clearAdminConfig, readAdminConfig, readBranding } from "../../admin/store";
import { appendAuditEvent, clearAuditLog } from "../../admin/audit-store";
import { clearAllInvites } from "../../admin/invite-store";
import { clearOriginOverride, resolveOriginConfig } from "../../admin/origin-store";
import { clearBypassSettings } from "../../admin/bypass-store";
import { clearGeoBlockSettings } from "../../admin/geo-block-store";
import { clearGeoBlockStats } from "../../admin/geo-block-stats";
import { clearSetupPending } from "../../admin/setup-pending-store";
import { clearTurnstileSettings } from "../../admin/turnstile-store";
import { UPDATE_CHECK_CACHE_KEY } from "../../admin/update-check";
import { configFromEnv, getQueueRoom } from "../../queue/client";
import { DEFAULT_MAX_WAITING_VISITORS } from "../../queue/engine";
import {
  MAX_ADMIT_PER_SECOND,
  MIN_ADMIT_PER_SECOND,
  parseAdmitPerSecond,
} from "../../queue/traffic";
import { parseQueueName, readJsonBody } from "../validation";
import { clientKey, requireSetupBearer, withCookie } from "./helpers";
import { dispatchWebhook } from "../../admin/webhook-dispatch";
import { clearWebhookSettings } from "../../admin/webhook-store";

/**
 * Issue an admission cookie for this admin browser and skip the waiting room.
 * Does not join the Durable Object queue or consume a concurrent slot.
 */
export async function handleAdminPass(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
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

export async function handleAdminSetMode(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
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
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
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
  void dispatchWebhook(env, "pause", queue, { paused });
  return jsonOk(result);
}

export async function handleAdminRate(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const admitPerSecond = parseAdmitPerSecond(body.admitPerSecond);
  if (admitPerSecond === null) {
    throw new ApiError(
      "bad_request",
      `admitPerSecond must be between ${MIN_ADMIT_PER_SECOND} and ${MAX_ADMIT_PER_SECOND}`,
      400,
    );
  }

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  const result = await room.setAdmitRate({ queue, config, admitPerSecond });
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "rate.set",
    summary: `Set max outflow to ${admitPerSecond}/s`,
    meta: { queue, admitPerSecond },
  });
  return jsonOk(result);
}

export async function handleAdminClearRate(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
  }

  const url = new URL(request.url);
  const body =
    request.method === "DELETE"
      ? ((await readJsonBody(request).catch(() => ({}))) as Record<string, unknown>)
      : {};
  const queue = parseQueueName(body.queue ?? url.searchParams.get("queue"), admin.defaultQueue);

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  const result = await room.clearAdmitRate({ queue, config });
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "rate.clear",
    summary: "Cleared max outflow override (env default)",
    meta: { queue },
  });
  return jsonOk(result);
}

export async function handleAdminTraffic(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
  }

  const url = new URL(request.url);
  const queue = parseQueueName(url.searchParams.get("queue"), admin.defaultQueue);
  const rangeRaw = url.searchParams.get("rangeMs");
  const rangeMs = rangeRaw ? Number(rangeRaw) : undefined;
  if (rangeMs !== undefined && (!Number.isFinite(rangeMs) || rangeMs < 1)) {
    throw new ApiError("bad_request", "rangeMs must be a positive number", 400);
  }
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  const traffic = await room.getTraffic({
    queue,
    config,
    ...(rangeMs !== undefined ? { rangeMs } : {}),
  });

  if (format === "csv") {
    const header = "t,iso,joins,admits,maxOutflow,waiting,entered";
    const lines = traffic.buckets.map((b) =>
      [
        b.t,
        new Date(b.t).toISOString(),
        b.joins,
        b.admits,
        b.maxOutflow,
        b.waiting,
        b.entered,
      ].join(","),
    );
    const body = `${header}\n${lines.join("\n")}\n`;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="tideguard-traffic-${queue}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  return jsonOk({ ok: true, ...traffic, refreshedAt: Date.now() });
}

export async function handleAdminSchedule(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
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
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
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
  void dispatchWebhook(env, "health", queue, {
    enabled,
    url: typeof healthInput.url === "string" ? healthInput.url : null,
  });
  return jsonOk(result);
}

/** Read waiting-row cap and missed-slot grace (danger-zone). */
export async function handleAdminQueueLimitsGet(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const url = new URL(request.url);
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE || "default");
  const room = getQueueRoom(env, queue);
  const limits = await room.getQueueLimits();
  return jsonOk({
    queue,
    maxWaitingVisitors: limits.maxWaitingVisitors,
    defaultMaxWaitingVisitors: DEFAULT_MAX_WAITING_VISITORS,
    missedSlotGraceSeconds: limits.missedSlotGraceSeconds,
    defaultMissedSlotGraceSeconds: DEFAULT_MISSED_SLOT_GRACE_SECONDS,
    minMissedSlotGraceSeconds: MIN_MISSED_SLOT_GRACE_SECONDS,
    maxMissedSlotGraceSeconds: MAX_MISSED_SLOT_GRACE_SECONDS,
  });
}

/**
 * Update waiting-row cap and/or missed-slot grace. Requires explicit confirmChanges
 * and A→B acknowledgement of previous values (danger zone).
 */
export async function handleAdminQueueLimitsPut(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE || "default");
  const nextMax = Math.floor(Number(body.maxWaitingVisitors));
  const nextGrace = Math.floor(Number(body.missedSlotGraceSeconds));
  if (!Number.isFinite(nextMax) || nextMax < 1 || nextMax > 50_000_000) {
    throw new ApiError(
      "bad_request",
      "maxWaitingVisitors must be an integer from 1 to 50000000",
      400,
    );
  }
  if (
    !Number.isFinite(nextGrace) ||
    nextGrace < MIN_MISSED_SLOT_GRACE_SECONDS ||
    nextGrace > MAX_MISSED_SLOT_GRACE_SECONDS
  ) {
    throw new ApiError(
      "bad_request",
      `missedSlotGraceSeconds must be an integer from ${MIN_MISSED_SLOT_GRACE_SECONDS} to ${MAX_MISSED_SLOT_GRACE_SECONDS}`,
      400,
    );
  }
  if (body.confirmChanges !== true) {
    throw new ApiError(
      "bad_request",
      "confirmChanges must be true after reviewing the A→B change list",
      400,
    );
  }
  const room = getQueueRoom(env, queue);
  const before = await room.getQueueLimits();
  if (Number(body.previousMaxWaitingVisitors) !== before.maxWaitingVisitors) {
    throw new ApiError(
      "conflict",
      "previousMaxWaitingVisitors does not match the current value — reload and try again",
      409,
    );
  }
  if (Number(body.previousMissedSlotGraceSeconds) !== before.missedSlotGraceSeconds) {
    throw new ApiError(
      "conflict",
      "previousMissedSlotGraceSeconds does not match the current value — reload and try again",
      409,
    );
  }

  const changed: Array<{ field: string; from: number; to: number }> = [];
  let maxWaitingVisitors = before.maxWaitingVisitors;
  let missedSlotGraceSeconds = before.missedSlotGraceSeconds;

  if (nextMax !== before.maxWaitingVisitors) {
    const result = await room.setMaxWaitingVisitors({ maxWaitingVisitors: nextMax });
    maxWaitingVisitors = result.maxWaitingVisitors;
    changed.push({
      field: "maxWaitingVisitors",
      from: before.maxWaitingVisitors,
      to: result.maxWaitingVisitors,
    });
  }
  if (nextGrace !== before.missedSlotGraceSeconds) {
    const result = await room.setMissedSlotGraceSeconds({ missedSlotGraceSeconds: nextGrace });
    missedSlotGraceSeconds = result.missedSlotGraceSeconds;
    changed.push({
      field: "missedSlotGraceSeconds",
      from: before.missedSlotGraceSeconds,
      to: result.missedSlotGraceSeconds,
    });
  }

  if (changed.length === 0) {
    throw new ApiError("bad_request", "No queue limit changes to apply", 400);
  }

  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "queue.limits",
    summary: changed.map((c) => `${c.field} ${c.from} → ${c.to}`).join("; "),
    meta: {
      queue,
      changed: changed.map((c) => `${c.field}:${c.from}->${c.to}`).join(","),
    },
  });
  return jsonOk({
    queue,
    maxWaitingVisitors,
    defaultMaxWaitingVisitors: DEFAULT_MAX_WAITING_VISITORS,
    missedSlotGraceSeconds,
    defaultMissedSlotGraceSeconds: DEFAULT_MISSED_SLOT_GRACE_SECONDS,
    minMissedSlotGraceSeconds: MIN_MISSED_SLOT_GRACE_SECONDS,
    maxMissedSlotGraceSeconds: MAX_MISSED_SLOT_GRACE_SECONDS,
    changed,
  });
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
  await clearWebhookSettings(env);
  await env.CONFIG_KV.delete(UPDATE_CHECK_CACHE_KEY);
  return jsonOk({ ok: true, setupComplete: false });
}
