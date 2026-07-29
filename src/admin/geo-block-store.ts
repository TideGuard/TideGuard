/**
 * Temporary country block list (CF-IPCountry) with TTL.
 * When expiresAt is in the past, the block is inactive.
 */

import { parseCountryCodes } from "../auth/geo-country";

export const GEO_BLOCK_KEY = "admin:geo-block";

const CACHE_TTL_MS = 5_000;
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let cached: { at: number; value: GeoBlockSettings } | null = null;

export interface GeoBlockSettings {
  enabled: boolean;
  /** Uppercase ISO country codes. */
  countries: string[];
  /** Unix ms; null means no expiry (until disabled). */
  expiresAt: number | null;
  updatedAt: number;
}

export interface GeoBlockPublicView {
  enabled: boolean;
  active: boolean;
  countries: string[];
  countriesText: string;
  expiresAt: number | null;
  updatedAt: number | null;
  clientCountry: string | null;
  clientBlocked: boolean;
  /** Hours remaining if active with expiry; null otherwise. */
  hoursRemaining: number | null;
  /** Hit counters for the current block window. */
  stats: {
    totalHits: number;
    byCountry: Array<{ country: string; hits: number }>;
    lastHitAt: number | null;
    lastHitCountry: string | null;
    windowStartedAt: number | null;
  };
}

const EMPTY: GeoBlockSettings = {
  enabled: false,
  countries: [],
  expiresAt: null,
  updatedAt: 0,
};

export class GeoBlockConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeoBlockConfigError";
  }
}

export function invalidateGeoBlockCache(): void {
  cached = null;
}

export async function readGeoBlockSettings(env: Env): Promise<GeoBlockSettings> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const raw = await env.CONFIG_KV.get(GEO_BLOCK_KEY, "json");
    const value = sanitize(raw);
    cached = { at: Date.now(), value };
    return value;
  } catch {
    cached = { at: Date.now(), value: EMPTY };
    return EMPTY;
  }
}

export async function clearGeoBlockSettings(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(GEO_BLOCK_KEY);
  invalidateGeoBlockCache();
}

export async function writeGeoBlockSettings(
  env: Env,
  input: {
    enabled: boolean;
    countriesText: string;
    /** Hours from now; ignored when enabled is false. */
    ttlHours?: number | null;
    /** Absolute expiry; wins over ttlHours when set. */
    expiresAt?: number | null;
  },
): Promise<GeoBlockSettings> {
  const { countries, errors } = parseCountryCodes(input.countriesText);
  if (errors.length > 0) {
    throw new GeoBlockConfigError(errors[0]!);
  }

  if (input.enabled && countries.length === 0) {
    throw new GeoBlockConfigError("Add at least one country code when enabling geo block");
  }

  let expiresAt: number | null = null;
  if (input.enabled) {
    if (typeof input.expiresAt === "number" && Number.isFinite(input.expiresAt)) {
      expiresAt = input.expiresAt;
    } else if (input.ttlHours !== undefined && input.ttlHours !== null) {
      const hours = Number(input.ttlHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new GeoBlockConfigError("ttlHours must be a positive number");
      }
      const ms = hours * 60 * 60 * 1000;
      if (ms > MAX_TTL_MS) {
        throw new GeoBlockConfigError("TTL cannot exceed 30 days");
      }
      expiresAt = Date.now() + ms;
    } else {
      throw new GeoBlockConfigError("Set a TTL (hours) so the block list can expire");
    }
    if (expiresAt <= Date.now()) {
      throw new GeoBlockConfigError("expiresAt must be in the future");
    }
    if (expiresAt - Date.now() > MAX_TTL_MS) {
      throw new GeoBlockConfigError("TTL cannot exceed 30 days");
    }
  }

  const next: GeoBlockSettings = {
    enabled: input.enabled,
    countries,
    expiresAt: input.enabled ? expiresAt : null,
    updatedAt: Date.now(),
  };
  await env.CONFIG_KV.put(GEO_BLOCK_KEY, JSON.stringify(next));
  invalidateGeoBlockCache();
  cached = { at: Date.now(), value: next };
  return next;
}

/** True when the block list is enabled, not expired, and has countries. */
export function isGeoBlockActive(settings: GeoBlockSettings, now = Date.now()): boolean {
  if (!settings.enabled || settings.countries.length === 0) {
    return false;
  }
  if (settings.expiresAt !== null && settings.expiresAt <= now) {
    return false;
  }
  return true;
}

export function effectiveBlockedCountries(settings: GeoBlockSettings, now = Date.now()): string[] {
  return isGeoBlockActive(settings, now) ? settings.countries : [];
}

export function toGeoBlockPublicView(
  settings: GeoBlockSettings,
  meta: {
    clientCountry: string | null;
    clientBlocked: boolean;
    stats?: {
      totalHits: number;
      byCountry: Array<{ country: string; hits: number }>;
      lastHitAt: number | null;
      lastHitCountry: string | null;
      windowStartedAt: number | null;
    };
  },
  now = Date.now(),
): GeoBlockPublicView {
  const active = isGeoBlockActive(settings, now);
  let hoursRemaining: number | null = null;
  if (active && settings.expiresAt !== null) {
    hoursRemaining = Math.max(0, (settings.expiresAt - now) / (60 * 60 * 1000));
  }
  return {
    enabled: settings.enabled,
    active,
    countries: settings.countries,
    countriesText: settings.countries.join("\n"),
    expiresAt: settings.expiresAt,
    updatedAt: settings.updatedAt || null,
    clientCountry: meta.clientCountry,
    clientBlocked: meta.clientBlocked,
    hoursRemaining,
    stats: meta.stats ?? {
      totalHits: 0,
      byCountry: [],
      lastHitAt: null,
      lastHitCountry: null,
      windowStartedAt: null,
    },
  };
}

function sanitize(raw: unknown): GeoBlockSettings {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY };
  }
  const obj = raw as Record<string, unknown>;
  const countries = Array.isArray(obj.countries)
    ? obj.countries
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c))
    : [];
  const expiresAt =
    typeof obj.expiresAt === "number" && Number.isFinite(obj.expiresAt) ? obj.expiresAt : null;
  return {
    enabled: obj.enabled === true,
    countries,
    expiresAt,
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : 0,
  };
}
