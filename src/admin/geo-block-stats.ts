/**
 * Hit counters for temporary country blocks (admin visibility).
 * Stored separately from the block config so saves don't wipe stats.
 * Approximate under concurrency (KV read-modify-write).
 */

export const GEO_BLOCK_STATS_KEY = "admin:geo-block-stats";

const CACHE_TTL_MS = 2_000;

let cached: { at: number; value: GeoBlockStats } | null = null;

export interface GeoBlockStats {
  totalHits: number;
  byCountry: Record<string, number>;
  lastHitAt: number | null;
  lastHitCountry: string | null;
  /** Stats window start (reset when a new block is enabled). */
  windowStartedAt: number | null;
}

export interface GeoBlockStatsPublic {
  totalHits: number;
  byCountry: Array<{ country: string; hits: number }>;
  lastHitAt: number | null;
  lastHitCountry: string | null;
  windowStartedAt: number | null;
}

const EMPTY: GeoBlockStats = {
  totalHits: 0,
  byCountry: {},
  lastHitAt: null,
  lastHitCountry: null,
  windowStartedAt: null,
};

export function invalidateGeoBlockStatsCache(): void {
  cached = null;
}

export async function readGeoBlockStats(env: Env): Promise<GeoBlockStats> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const raw = await env.CONFIG_KV.get(GEO_BLOCK_STATS_KEY, "json");
    const value = sanitize(raw);
    cached = { at: Date.now(), value };
    return value;
  } catch {
    cached = { at: Date.now(), value: EMPTY };
    return EMPTY;
  }
}

export async function clearGeoBlockStats(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(GEO_BLOCK_STATS_KEY);
  invalidateGeoBlockStatsCache();
}

/** Start a fresh hit window when enabling a new country block. */
export async function resetGeoBlockStatsWindow(env: Env): Promise<GeoBlockStats> {
  const next: GeoBlockStats = {
    totalHits: 0,
    byCountry: {},
    lastHitAt: null,
    lastHitCountry: null,
    windowStartedAt: Date.now(),
  };
  await env.CONFIG_KV.put(GEO_BLOCK_STATS_KEY, JSON.stringify(next));
  invalidateGeoBlockStatsCache();
  cached = { at: Date.now(), value: next };
  return next;
}

export async function recordGeoBlockHit(env: Env, country: string | null): Promise<void> {
  const code = (country ?? "XX").toUpperCase().slice(0, 2);
  const now = Date.now();
  const current = await readGeoBlockStats(env);
  const byCountry = { ...current.byCountry };
  byCountry[code] = (byCountry[code] ?? 0) + 1;
  const next: GeoBlockStats = {
    totalHits: current.totalHits + 1,
    byCountry,
    lastHitAt: now,
    lastHitCountry: code,
    windowStartedAt: current.windowStartedAt ?? now,
  };
  await env.CONFIG_KV.put(GEO_BLOCK_STATS_KEY, JSON.stringify(next));
  invalidateGeoBlockStatsCache();
  cached = { at: Date.now(), value: next };
}

export function toGeoBlockStatsPublic(stats: GeoBlockStats): GeoBlockStatsPublic {
  const byCountry = Object.entries(stats.byCountry)
    .map(([country, hits]) => ({ country, hits }))
    .sort((a, b) => b.hits - a.hits || a.country.localeCompare(b.country));
  return {
    totalHits: stats.totalHits,
    byCountry,
    lastHitAt: stats.lastHitAt,
    lastHitCountry: stats.lastHitCountry,
    windowStartedAt: stats.windowStartedAt,
  };
}

function sanitize(raw: unknown): GeoBlockStats {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY };
  }
  const obj = raw as Record<string, unknown>;
  const byCountry: Record<string, number> = {};
  if (obj.byCountry && typeof obj.byCountry === "object" && !Array.isArray(obj.byCountry)) {
    for (const [key, value] of Object.entries(obj.byCountry as Record<string, unknown>)) {
      const code = key.toUpperCase();
      const hits = typeof value === "number" ? value : Number(value);
      if (/^[A-Z]{2}$/.test(code) && Number.isFinite(hits) && hits > 0) {
        byCountry[code] = Math.floor(hits);
      }
    }
  }
  return {
    totalHits:
      typeof obj.totalHits === "number" && Number.isFinite(obj.totalHits)
        ? Math.max(0, Math.floor(obj.totalHits))
        : Object.values(byCountry).reduce((a, b) => a + b, 0),
    byCountry,
    lastHitAt:
      typeof obj.lastHitAt === "number" && Number.isFinite(obj.lastHitAt) ? obj.lastHitAt : null,
    lastHitCountry:
      typeof obj.lastHitCountry === "string" && /^[A-Z]{2}$/i.test(obj.lastHitCountry)
        ? obj.lastHitCountry.toUpperCase()
        : null,
    windowStartedAt:
      typeof obj.windowStartedAt === "number" && Number.isFinite(obj.windowStartedAt)
        ? obj.windowStartedAt
        : null,
  };
}
