import { ApiError, jsonOk } from "../../core/errors";
import type { WaitingRoomBranding } from "../../core/branding";
import { requireAdminSession } from "../../auth/operator";
import { readAdminConfig, sanitizeBrandingInput, writeBranding } from "../../admin/store";
import { appendAuditEvent } from "../../admin/audit-store";
import { writeOriginOverride } from "../../admin/origin-store";
import { BypassConfigError, toBypassPublicView, writeAllowlist } from "../../admin/bypass-store";
import {
  effectiveBlockedCountries,
  GeoBlockConfigError,
  toGeoBlockPublicView,
  writeGeoBlockSettings,
} from "../../admin/geo-block-store";
import {
  readGeoBlockStats,
  resetGeoBlockStatsWindow,
  toGeoBlockStatsPublic,
} from "../../admin/geo-block-stats";
import { clientConnectingIp, hasConnectingIpHeader } from "../../auth/client-ip";
import { clientCountryCode, isCountryBlocked } from "../../auth/geo-country";
import { normalizeOriginUrl, parsePathPrefixes } from "../../core/origin";
import { configFromEnv, getQueueRoom } from "../../queue/client";
import { parseQueueName, readJsonBody } from "../validation";

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
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
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
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
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
