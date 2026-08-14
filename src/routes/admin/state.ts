import { ApiError, jsonOk } from "../../core/errors";
import type { AdmissionMode } from "../../core/types";
import { requireAdminSession } from "../../auth/operator";
import { rateLimitOrThrow } from "../../auth";
import { readAdminConfig, readBranding, rememberKnownQueue } from "../../admin/store";
import { readAuditEvents } from "../../admin/audit-store";
import { listInvites, toPublicInvite } from "../../admin/invite-store";
import { resolveOriginConfig } from "../../admin/origin-store";
import { readBypassSettings, toBypassPublicView } from "../../admin/bypass-store";
import {
  effectiveBlockedCountries,
  readGeoBlockSettings,
  toGeoBlockPublicView,
} from "../../admin/geo-block-store";
import { readGeoBlockStats, toGeoBlockStatsPublic } from "../../admin/geo-block-stats";
import { readTurnstileSettings, toTurnstilePublicView } from "../../admin/turnstile-store";
import { clientConnectingIp, hasConnectingIpHeader } from "../../auth/client-ip";
import { clientCountryCode, isCountryBlocked } from "../../auth/geo-country";
import { checkForUpdates } from "../../admin/update-check";
import { configFromEnv, getQueueRoom } from "../../queue/client";
import { VERSION } from "../../version";
import { parseQueueName } from "../validation";
import { clientKey } from "./helpers";
import { maybeDispatchDepthWebhook } from "../../admin/webhook-dispatch";
import { readWebhookSettings, toPublicWebhooks } from "../../admin/webhook-store";
import { readRoomRules } from "../../admin/room-rules-store";
import { checkInPeriodSeconds } from "../../queue/engine";
import { maybeDispatchOriginUnhealthyWebhook } from "../../admin/webhook-dispatch";

export async function handleAdminState(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
  }

  const queue = parseQueueName(
    new URL(request.url).searchParams.get("queue") ?? admin.defaultQueue,
    admin.defaultQueue,
  );
  await rememberKnownQueue(env, queue);
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
    webhooksSettings,
    roomRules,
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
    readWebhookSettings(env),
    readRoomRules(env),
  ]);

  const checkInPeriod = checkInPeriodSeconds(metrics.waiting);
  void maybeDispatchOriginUnhealthyWebhook(env, queue, metrics.health.autoPaused, {
    level: metrics.health.level,
    lastStatus: metrics.health.lastStatus,
    lastError: metrics.health.lastError,
  });
  const clientIp = clientConnectingIp(request);
  const clientCountry = clientCountryCode(request);
  const blockedCountries = effectiveBlockedCountries(geoSettings);
  return jsonOk({
    queue,
    knownQueues: [...new Set([...admin.knownQueues, queue])],
    branding,
    metrics: {
      ...metrics,
      checkInPeriodSeconds: checkInPeriod,
      checkInPeriodWarning: checkInPeriod >= 120,
    },
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
    webhooks: toPublicWebhooks(webhooksSettings),
    roomRules,
    traffic: {
      opensAt: metrics.opensAt,
      closesAt: metrics.closesAt,
      closeAction: metrics.closeAction,
      roomPhase: metrics.roomPhase,
      paused: metrics.paused,
      health: metrics.health,
      effectiveAdmitPerSecond: metrics.effectiveAdmitPerSecond,
      admitPerSecond: metrics.admitPerSecond,
      admitPerSecondOverride: metrics.admitPerSecondOverride,
      admitPerSecondDefault: metrics.admitPerSecondDefault,
      totalInflow: metrics.totalInflow,
      inflowCurrent: metrics.inflowCurrent,
      outflowCurrent: metrics.outflowCurrent,
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

export async function handleAdminMetrics(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
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
  const checkInPeriod = checkInPeriodSeconds(metrics.waiting);
  void maybeDispatchDepthWebhook(env, queue, metrics.waiting);
  void maybeDispatchOriginUnhealthyWebhook(env, queue, metrics.health.autoPaused, {
    level: metrics.health.level,
    lastStatus: metrics.health.lastStatus,
    lastError: metrics.health.lastError,
  });
  return jsonOk({
    ok: true,
    metrics: {
      ...metrics,
      checkInPeriodSeconds: checkInPeriod,
      checkInPeriodWarning: checkInPeriod >= 120,
    },
    geoBlock: toGeoBlockPublicView(geoSettings, {
      clientCountry,
      clientBlocked: isCountryBlocked(clientCountry, blockedCountries),
      stats: toGeoBlockStatsPublic(geoStats),
    }),
    refreshedAt: Date.now(),
  });
}
