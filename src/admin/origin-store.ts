import type { OriginProxyConfig } from "../core/origin";
import {
  DEFAULT_ORIGIN_CONFIG,
  mergeOriginConfig,
  normalizeOriginUrl,
  parseOriginConfigFromEnv,
  parsePathPrefixes,
} from "../core/origin";

export const ORIGIN_SETTINGS_KEY = "admin:origin";

/** Soft cache so high-QPS proxy paths avoid a KV read on every request. */
const CACHE_TTL_MS = 5_000;
let cached: { at: number; value: OriginProxyConfig } | null = null;

export type OriginSettingsOverride = Partial<{
  enabled: boolean;
  originUrl: string | null;
  protectAll: boolean;
  pathPrefixes: string[];
  queue: string;
}>;

export async function readOriginOverride(env: Env): Promise<OriginSettingsOverride | null> {
  try {
    const raw = await env.CONFIG_KV.get(ORIGIN_SETTINGS_KEY, "json");
    if (!raw || typeof raw !== "object") {
      return null;
    }
    return sanitizeOverride(raw as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function writeOriginOverride(
  env: Env,
  override: OriginSettingsOverride,
): Promise<OriginProxyConfig> {
  const cleaned = sanitizeOverride(override as Record<string, unknown>);
  await env.CONFIG_KV.put(ORIGIN_SETTINGS_KEY, JSON.stringify(cleaned));
  invalidateOriginConfigCache();
  return resolveOriginConfig(env, cleaned);
}

export async function clearOriginOverride(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(ORIGIN_SETTINGS_KEY);
  invalidateOriginConfigCache();
}

export function invalidateOriginConfigCache(): void {
  cached = null;
}

export async function resolveOriginConfig(
  env: Env,
  override?: OriginSettingsOverride | null,
): Promise<OriginProxyConfig> {
  if (override === undefined && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const envInput: {
    ORIGIN_URL?: string;
    ORIGIN_PROTECT_ALL?: string;
    ORIGIN_PATH_PREFIXES?: string;
    DEFAULT_QUEUE?: string;
  } = {};
  if (env.ORIGIN_URL !== undefined) envInput.ORIGIN_URL = env.ORIGIN_URL;
  if (env.ORIGIN_PROTECT_ALL !== undefined) envInput.ORIGIN_PROTECT_ALL = env.ORIGIN_PROTECT_ALL;
  if (env.ORIGIN_PATH_PREFIXES !== undefined) {
    envInput.ORIGIN_PATH_PREFIXES = env.ORIGIN_PATH_PREFIXES;
  }
  if (env.DEFAULT_QUEUE !== undefined) envInput.DEFAULT_QUEUE = env.DEFAULT_QUEUE;

  const envConfig = parseOriginConfigFromEnv(envInput);
  const stored = override === undefined ? await readOriginOverride(env) : override;
  const value = !stored
    ? envConfig.originUrl
      ? envConfig
      : { ...DEFAULT_ORIGIN_CONFIG, queue: envConfig.queue }
    : mergeOriginConfig(envConfig, stored);

  if (override === undefined) {
    cached = { at: Date.now(), value };
  }
  return value;
}

function sanitizeOverride(raw: Record<string, unknown>): OriginSettingsOverride {
  const out: OriginSettingsOverride = {};

  if (typeof raw.enabled === "boolean") {
    out.enabled = raw.enabled;
  }
  if (raw.originUrl === null) {
    out.originUrl = null;
  } else if (typeof raw.originUrl === "string") {
    out.originUrl = normalizeOriginUrl(raw.originUrl);
  }
  if (typeof raw.protectAll === "boolean") {
    out.protectAll = raw.protectAll;
  }
  if (Array.isArray(raw.pathPrefixes)) {
    out.pathPrefixes = parsePathPrefixes(
      raw.pathPrefixes.filter((p) => typeof p === "string").join(","),
    );
  } else if (typeof raw.pathPrefixes === "string") {
    out.pathPrefixes = parsePathPrefixes(raw.pathPrefixes);
  }
  if (typeof raw.queue === "string" && raw.queue.length > 0) {
    out.queue = raw.queue;
  }

  return out;
}
