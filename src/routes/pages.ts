import { ApiError } from "../core/errors";
import { sanitizeRedirectUrl } from "../core/branding";
import { requireAdmission, withSecurityHeaders } from "../auth";
import { renderProtectedDemo } from "../demo/protected";
import { renderWaitingRoom } from "../html/waiting-room";
import { readBranding } from "../admin/store";
import { resolveOriginConfig } from "../admin/origin-store";
import { getQueueRoom } from "../queue/client";
import { parseQueueName } from "./validation";

export async function handleWaitingRoom(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE);
  const embed = url.searchParams.get("embed") === "1";
  const origin = await resolveOriginConfig(env);
  const branding = await readBranding(env, queue);
  const fallbackReturn = branding.redirectUrl || (origin.enabled ? "/" : "/demo");
  const returnTo = resolveReturnTo(url.searchParams.get("return"), fallbackReturn);

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
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE);

  try {
    const admission = await requireAdmission(request, env, queue);
    const html = renderProtectedDemo({
      queueName: admission.queue,
      visitorId: admission.visitorId,
    });
    return withSecurityHeaders(
      new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === "unauthorized") {
      const wait = new URL("/wait", url.origin);
      wait.searchParams.set("queue", queue);
      wait.searchParams.set("return", "/demo");
      return withSecurityHeaders(Response.redirect(wait.toString(), 302));
    }
    throw error;
  }
}

/** Prefer ?return=, else branding / proxy default. Same-origin paths only. */
export function resolveReturnTo(queryReturn: string | null, fallback: string): string {
  const fromQuery = sanitizeRedirectUrl(queryReturn ?? "", "");
  if (fromQuery) {
    return fromQuery;
  }
  return sanitizeRedirectUrl(fallback, "/demo") || "/demo";
}
