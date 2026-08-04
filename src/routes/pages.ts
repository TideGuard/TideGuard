import { sanitizeRedirectUrl } from "../core/branding";
import {
  appendSetCookies,
  resolveAccessGate,
  waitingRoomRedirectUrl,
  withSecurityHeaders,
} from "../auth";
import { renderProtectedDemo } from "../demo/protected";
import { renderWaitingRoom } from "../html/waiting-room";
import { readBranding } from "../admin/store";
import { resolveOriginConfig } from "../admin/origin-store";
import { maybeAdmitIpBypass } from "../admin/ip-bypass";
import { evaluateGeoBlock } from "../admin/geo-block";
import { geoBlockedResponse } from "../html/geo-blocked";
import { configFromEnv, getQueueRoom } from "../queue/client";
import { parseQueueName } from "./validation";

export async function handleWaitingRoom(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE || "default");
  const embed = url.searchParams.get("embed") === "1";
  const origin = await resolveOriginConfig(env);
  const branding = await readBranding(env, queue);
  const fallbackReturn = branding.redirectUrl || (origin.enabled ? "/" : "/demo");
  const returnTo = resolveReturnTo(url.searchParams.get("return"), fallbackReturn);
  const queueConfig = configFromEnv(env);
  const fixedPollMs = parseOptionalPositiveInt(env.WAITING_ROOM_POLL_INTERVAL_MS);
  const fixedHeartbeatMs = parseOptionalPositiveInt(env.WAITING_ROOM_HEARTBEAT_INTERVAL_MS);

  const bypass = await maybeAdmitIpBypass(request, env, queue);
  if (bypass && !embed) {
    return withSecurityHeaders(
      appendSetCookies(Response.redirect(new URL(returnTo, url.origin).toString(), 302), [
        bypass.accessCookie,
      ]),
    );
  }

  const geo = await evaluateGeoBlock(request, env);
  if (geo.blocked) {
    return withSecurityHeaders(geoBlockedResponse(geo.country, { embed }));
  }

  let opensAt: number | null;
  try {
    const room = getQueueRoom(env, queue);
    const schedule = await room.getSchedule();
    opensAt = schedule.opensAt;
  } catch {
    opensAt = null;
  }

  const html = renderWaitingRoom({
    queue,
    embed,
    returnTo,
    branding,
    opensAt,
    locale: url.searchParams.get("lang"),
    heartbeatTimeoutSeconds: queueConfig.heartbeatTimeoutSeconds,
    ...(fixedPollMs !== undefined ? { pollIntervalMs: fixedPollMs } : {}),
    ...(fixedHeartbeatMs !== undefined ? { heartbeatIntervalMs: fixedHeartbeatMs } : {}),
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

export async function handleDemo(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE || "default");

  const gate = await resolveAccessGate(request, env, queue);
  if (gate.kind === "admitted") {
    return withSecurityHeaders(
      demoHtmlResponse({
        queueName: gate.queue,
        visitorId: gate.visitorId,
      }),
    );
  }
  if (gate.kind === "bypass") {
    return withSecurityHeaders(
      appendSetCookies(
        demoHtmlResponse({
          queueName: gate.bypass.queue,
          visitorId: gate.bypass.visitorId,
        }),
        [gate.bypass.accessCookie],
      ),
    );
  }
  if (gate.kind === "geo_blocked") {
    return withSecurityHeaders(geoBlockedResponse(gate.country));
  }

  const wait = waitingRoomRedirectUrl(url.origin, queue, "/demo");
  return withSecurityHeaders(Response.redirect(wait.toString(), 302));
}

function demoHtmlResponse(input: { queueName: string; visitorId: string }): Response {
  const html = renderProtectedDemo(input);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Prefer ?return=, else branding / proxy default. Same-origin paths only. */
export function resolveReturnTo(queryReturn: string | null, fallback: string): string {
  const fromQuery = sanitizeRedirectUrl(queryReturn ?? "", "");
  if (fromQuery) {
    return fromQuery;
  }
  return sanitizeRedirectUrl(fallback, "/demo") || "/demo";
}

/** Optional positive int env override (e.g. fixed waiting-room intervals). */
function parseOptionalPositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return undefined;
  return n;
}
