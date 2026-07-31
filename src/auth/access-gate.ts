/**
 * Shared admission gate: token → IP bypass → geo block → wait redirect.
 * Used by origin proxy and demo so the control flow stays in one place.
 */

import { ApiError } from "../core/errors";
import { maybeAdmitIpBypass, type IpBypassAdmission } from "../admin/ip-bypass";
import { evaluateGeoBlock } from "../admin/geo-block";
import { requireAdmission } from "./admission";

export type AccessGateAdmitted = {
  kind: "admitted";
  visitorId: string;
  queue: string;
  token: string;
};

export type AccessGateBypass = {
  kind: "bypass";
  bypass: IpBypassAdmission;
};

export type AccessGateGeoBlocked = {
  kind: "geo_blocked";
  country: string | null;
};

export type AccessGateRedirectWait = {
  kind: "redirect_wait";
};

export type AccessGateResult =
  AccessGateAdmitted | AccessGateBypass | AccessGateGeoBlocked | AccessGateRedirectWait;

/**
 * Resolve whether a request may access a protected surface.
 * Does not build HTTP responses — callers map the result to proxy, demo HTML, or redirect.
 */
export async function resolveAccessGate(
  request: Request,
  env: Env,
  queue: string,
): Promise<AccessGateResult> {
  try {
    const admission = await requireAdmission(request, env, queue);
    return {
      kind: "admitted",
      visitorId: admission.visitorId,
      queue: admission.queue,
      token: admission.token,
    };
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "unauthorized") {
      throw error;
    }
  }

  const bypass = await maybeAdmitIpBypass(request, env, queue);
  if (bypass) {
    return { kind: "bypass", bypass };
  }

  const geo = await evaluateGeoBlock(request, env);
  if (geo.blocked) {
    return { kind: "geo_blocked", country: geo.country };
  }

  return { kind: "redirect_wait" };
}

/** Build `/wait?queue=&return=` for unauthorized visitors. */
export function waitingRoomRedirectUrl(origin: string, queue: string, returnPath: string): URL {
  const wait = new URL("/wait", origin);
  wait.searchParams.set("queue", queue);
  wait.searchParams.set("return", returnPath);
  return wait;
}
