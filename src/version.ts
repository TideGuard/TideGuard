/** Package version surfaced by `/health`, admin, and update checks. */
export const VERSION = "0.5.1";

/** Upstream GitHub repository used for release checks. */
export const GITHUB_REPO = "TideGuard/TideGuard";

export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;

export const GITHUB_RELEASES_LATEST_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** Strip a leading `v` / `V` and trim. */
export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

/**
 * Compare two SemVer-ish strings (`1.2.3` or `v1.2.3`).
 * Returns negative if `a < b`, 0 if equal, positive if `a > b`.
 * Non-numeric suffixes are ignored after the numeric core.
 */
export function compareSemVer(a: string, b: string): number {
  const pa = normalizeVersion(a)
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10));
  const pb = normalizeVersion(b)
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10));
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const av = Number.isFinite(pa[i]) ? pa[i]! : 0;
    const bv = Number.isFinite(pb[i]) ? pb[i]! : 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
