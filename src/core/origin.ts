/**
 * Origin proxy configuration: when set, TideGuard gates non-reserved paths
 * and forwards admitted traffic to your upstream origin.
 */

export interface OriginProxyConfig {
  /** Proxy is active when enabled and originUrl is a valid absolute URL. */
  enabled: boolean;
  /** Absolute origin base, e.g. https://shop.example.com (no trailing slash required). */
  originUrl: string | null;
  /** When true, every non-reserved path requires admission. */
  protectAll: boolean;
  /** Path prefixes that require admission when protectAll is false. */
  pathPrefixes: string[];
  /** Queue used for admission checks on protected paths. */
  queue: string;
}

export const DEFAULT_ORIGIN_CONFIG: OriginProxyConfig = {
  enabled: false,
  originUrl: null,
  protectAll: true,
  pathPrefixes: [],
  queue: "default",
};

/** Paths TideGuard always serves itself (never proxied). */
const RESERVED_EXACT = new Set([
  "/",
  "/health",
  "/wait",
  "/join",
  "/status",
  "/leave",
  "/heartbeat",
  "/enter",
  "/admit",
  "/mode",
  "/pause",
  "/metrics",
  "/admin",
  "/cost",
  "/demo",
  "/api/cost-estimate",
  "/sounds/notification.mp3",
]);

const RESERVED_PREFIXES = ["/api/admin"];

/**
 * When origin proxy is enabled, `/` is proxied to the origin home instead of
 * the TideGuard landing page. Other control-plane paths stay reserved.
 */
export function isTideGuardPath(pathname: string, originEnabled: boolean): boolean {
  if (pathname === "/") {
    return !originEnabled;
  }
  if (RESERVED_EXACT.has(pathname)) {
    return true;
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return true;
  }
  return RESERVED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function shouldRequireAdmission(pathname: string, config: OriginProxyConfig): boolean {
  if (!config.enabled || !config.originUrl) {
    return false;
  }
  if (isTideGuardPath(pathname, true)) {
    return false;
  }
  if (config.protectAll) {
    return true;
  }
  return config.pathPrefixes.some((prefix) => pathMatchesPrefix(pathname, prefix));
}

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) {
    return true;
  }
  const normalized = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return pathname.startsWith(`${normalized}/`);
}

/** Paths that should be forwarded to origin when proxy is enabled. */
export function shouldProxyToOrigin(pathname: string, config: OriginProxyConfig): boolean {
  if (!config.enabled || !config.originUrl) {
    return false;
  }
  return !isTideGuardPath(pathname, true);
}

export function parseOriginConfigFromEnv(env: {
  ORIGIN_URL?: string;
  ORIGIN_PROTECT_ALL?: string;
  ORIGIN_PATH_PREFIXES?: string;
  DEFAULT_QUEUE?: string;
}): OriginProxyConfig {
  const originUrl = normalizeOriginUrl(env.ORIGIN_URL ?? "");
  const protectAll = parseBool(env.ORIGIN_PROTECT_ALL, true);
  const pathPrefixes = parsePathPrefixes(env.ORIGIN_PATH_PREFIXES ?? "");
  const queue =
    typeof env.DEFAULT_QUEUE === "string" && env.DEFAULT_QUEUE.length > 0
      ? env.DEFAULT_QUEUE
      : "default";

  return {
    enabled: originUrl !== null,
    originUrl,
    protectAll,
    pathPrefixes,
    queue,
  };
}

export function mergeOriginConfig(
  envConfig: OriginProxyConfig,
  override: Partial<OriginProxyConfig> | null | undefined,
): OriginProxyConfig {
  if (!override) {
    return envConfig;
  }

  const originUrl =
    override.originUrl !== undefined ? normalizeOriginUrl(override.originUrl) : envConfig.originUrl;

  const protectAll = override.protectAll ?? envConfig.protectAll;
  const pathPrefixes = override.pathPrefixes ?? envConfig.pathPrefixes;
  const queue = override.queue && override.queue.length > 0 ? override.queue : envConfig.queue;

  const enabled =
    override.enabled !== undefined
      ? Boolean(override.enabled) && originUrl !== null
      : originUrl !== null;

  return {
    enabled,
    originUrl,
    protectAll,
    pathPrefixes,
    queue,
  };
}

export function normalizeOriginUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (isBlockedOriginHost(url.hostname)) {
    return null;
  }
  // Drop path/query/hash from the base; paths come from the visitor request.
  return `${url.protocol}//${url.host}`;
}

/** Reject loopback / private / link-local / cloud metadata hosts (SSRF guard). */
export function isBlockedOriginHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1"
  ) {
    return true;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return isPrivateIpv4(host);
  }

  // URL.hostname may be an IPv6 literal without brackets.
  if (host.includes(":")) {
    return isPrivateIpv6(host);
  }

  return false;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
  if (normalized.startsWith("fe80:")) return true; // link-local
  return false;
}

export function parsePathPrefixes(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("/") && !part.startsWith("//"))
    .map((part) => (part.length > 1 && part.endsWith("/") ? part.slice(0, -1) : part));
}

export function buildUpstreamUrl(originBase: string, requestUrl: URL): URL {
  const upstream = new URL(originBase);
  upstream.pathname = requestUrl.pathname;
  upstream.search = requestUrl.search;
  return upstream;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}
