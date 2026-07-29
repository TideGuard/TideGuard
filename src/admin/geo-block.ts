/**
 * Decide whether this request should be geo-blocked.
 * IP allowlist always wins (office staff are not geo-blocked).
 */

import { clientConnectingIp } from "../auth/client-ip";
import { clientCountryCode, isCountryBlocked } from "../auth/geo-country";
import { isIpAllowlisted, readBypassSettings } from "./bypass-store";
import { effectiveBlockedCountries, readGeoBlockSettings } from "./geo-block-store";
import { recordGeoBlockHit } from "./geo-block-stats";

export interface GeoBlockDecision {
  blocked: boolean;
  country: string | null;
  reason?: "country";
}

export async function evaluateGeoBlock(
  request: Request,
  env: Env,
  options: { recordHit?: boolean } = {},
): Promise<GeoBlockDecision> {
  const country = clientCountryCode(request);
  const geo = await readGeoBlockSettings(env);
  const blockedList = effectiveBlockedCountries(geo);
  if (blockedList.length === 0) {
    return { blocked: false, country };
  }

  const bypass = await readBypassSettings(env);
  const ip = clientConnectingIp(request);
  if (isIpAllowlisted(ip, bypass)) {
    return { blocked: false, country };
  }

  if (isCountryBlocked(country, blockedList)) {
    if (options.recordHit !== false) {
      // Best-effort counter for the admin live dashboard.
      void recordGeoBlockHit(env, country).catch(() => {});
    }
    return { blocked: true, country, reason: "country" };
  }

  return { blocked: false, country };
}
