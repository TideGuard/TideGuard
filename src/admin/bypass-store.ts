/**
 * IP allowlist + optional Cloudflare API credentials for setup checks.
 * Stored in KV; API token is encrypted with TOKEN_SECRET.
 */

import { requireTokenSecret } from "../auth/operator";
import { ipMatchesAllowlist, parseAllowlistText } from "../auth/ip-allowlist";
import { openSecret, sealSecret } from "./secret-box";

export const BYPASS_SETTINGS_KEY = "admin:bypass";

const CACHE_TTL_MS = 5_000;
let cached: { at: number; value: BypassSettings } | null = null;

export interface BypassSettings {
  /** CIDR / IP entries that skip the waiting room. */
  allowlist: string[];
  /** Cloudflare zone id for DNS proxy checks (optional). */
  zoneId: string | null;
  /** Hostname whose DNS record should be proxied (optional). */
  hostname: string | null;
  /** Encrypted API token blob, or null. */
  apiTokenSealed: string | null;
}

export interface BypassPublicView {
  allowlist: string[];
  allowlistText: string;
  zoneId: string | null;
  hostname: string | null;
  hasApiToken: boolean;
  clientIp: string | null;
  clientIpMatched: boolean;
  connectingIpPresent: boolean;
}

const EMPTY: BypassSettings = {
  allowlist: [],
  zoneId: null,
  hostname: null,
  apiTokenSealed: null,
};

export function invalidateBypassCache(): void {
  cached = null;
}

export async function readBypassSettings(env: Env): Promise<BypassSettings> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const raw = await env.CONFIG_KV.get(BYPASS_SETTINGS_KEY, "json");
    const value = sanitizeSettings(raw);
    cached = { at: Date.now(), value };
    return value;
  } catch {
    cached = { at: Date.now(), value: EMPTY };
    return EMPTY;
  }
}

export async function clearBypassSettings(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(BYPASS_SETTINGS_KEY);
  invalidateBypassCache();
}

export async function writeAllowlist(env: Env, text: string): Promise<BypassSettings> {
  const { entries, errors } = parseAllowlistText(text);
  if (errors.length > 0) {
    throw new BypassConfigError(errors[0]!);
  }
  const current = await readBypassSettings(env);
  const next: BypassSettings = { ...current, allowlist: entries };
  await env.CONFIG_KV.put(BYPASS_SETTINGS_KEY, JSON.stringify(next));
  invalidateBypassCache();
  cached = { at: Date.now(), value: next };
  return next;
}

export async function writeCloudflareLink(
  env: Env,
  input: {
    zoneId: string | null;
    hostname: string | null;
    apiToken?: string | null;
    clearApiToken?: boolean;
  },
): Promise<BypassSettings> {
  const current = await readBypassSettings(env);
  let apiTokenSealed = current.apiTokenSealed;

  if (input.clearApiToken) {
    apiTokenSealed = null;
  } else if (typeof input.apiToken === "string" && input.apiToken.trim().length > 0) {
    const token = input.apiToken.trim();
    if (token.length < 20) {
      throw new BypassConfigError("Cloudflare API token looks too short");
    }
    apiTokenSealed = await sealSecret(token, requireTokenSecret(env));
  }

  const zoneId = normalizeOptional(input.zoneId);
  const hostname = normalizeHostname(input.hostname);

  const next: BypassSettings = {
    ...current,
    zoneId,
    hostname,
    apiTokenSealed,
  };
  await env.CONFIG_KV.put(BYPASS_SETTINGS_KEY, JSON.stringify(next));
  invalidateBypassCache();
  cached = { at: Date.now(), value: next };
  return next;
}

export async function readCloudflareApiToken(env: Env): Promise<string | null> {
  const settings = await readBypassSettings(env);
  if (!settings.apiTokenSealed) {
    return null;
  }
  try {
    return await openSecret(settings.apiTokenSealed, requireTokenSecret(env));
  } catch {
    return null;
  }
}

export function isIpAllowlisted(ip: string | null, settings: BypassSettings): boolean {
  if (!ip || settings.allowlist.length === 0) {
    return false;
  }
  return ipMatchesAllowlist(ip, settings.allowlist);
}

export function toBypassPublicView(
  settings: BypassSettings,
  requestMeta: { clientIp: string | null; connectingIpPresent: boolean },
): BypassPublicView {
  return {
    allowlist: settings.allowlist,
    allowlistText: settings.allowlist.join("\n"),
    zoneId: settings.zoneId,
    hostname: settings.hostname,
    hasApiToken: Boolean(settings.apiTokenSealed),
    clientIp: requestMeta.clientIp,
    clientIpMatched: isIpAllowlisted(requestMeta.clientIp, settings),
    connectingIpPresent: requestMeta.connectingIpPresent,
  };
}

export class BypassConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BypassConfigError";
  }
}

function sanitizeSettings(raw: unknown): BypassSettings {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY };
  }
  const obj = raw as Record<string, unknown>;
  const allowlist = Array.isArray(obj.allowlist)
    ? obj.allowlist.filter((v): v is string => typeof v === "string")
    : [];
  return {
    allowlist,
    zoneId: typeof obj.zoneId === "string" && obj.zoneId.trim() ? obj.zoneId.trim() : null,
    hostname:
      typeof obj.hostname === "string" && obj.hostname.trim()
        ? normalizeHostname(obj.hostname)
        : null,
    apiTokenSealed:
      typeof obj.apiTokenSealed === "string" && obj.apiTokenSealed.length > 0
        ? obj.apiTokenSealed
        : null,
  };
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeHostname(value: string | null | undefined): string | null {
  const raw = normalizeOptional(value);
  if (!raw) {
    return null;
  }
  try {
    if (raw.includes("://")) {
      return new URL(raw).hostname.toLowerCase();
    }
  } catch {
    return null;
  }
  return raw.replace(/\.$/, "").toLowerCase();
}
