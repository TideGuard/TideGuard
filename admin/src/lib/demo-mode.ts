import type { OriginSettings } from "./types";

/**
 * Demo mode: origin is not gating real site traffic.
 * Post-wizard default is enabled=false. Also true when proxy is on but
 * protect-all is off and no path prefixes are configured (nothing requires admission).
 */
export function isDemoMode(
  origin: Pick<OriginSettings, "enabled" | "protectAll" | "pathPrefixes">,
): boolean {
  if (!origin.enabled) return true;
  const prefixes = Array.isArray(origin.pathPrefixes) ? origin.pathPrefixes : [];
  return !origin.protectAll && prefixes.length === 0;
}
