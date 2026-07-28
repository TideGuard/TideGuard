/**
 * Forward an admitted (or passthrough) request to the configured origin.
 *
 * Security: never forward TideGuard cookies, Authorization, or hop-by-hop
 * headers. Strip Set-Cookie from the origin so the gate hostname cannot be
 * polluted by upstream session cookies.
 */

import { buildUpstreamUrl, type OriginProxyConfig } from "../core/origin";

const REQUEST_SKIP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cdn-loop",
  "authorization",
  "cookie",
]);

const RESPONSE_SKIP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "set-cookie",
]);

export async function proxyToOrigin(
  request: Request,
  config: OriginProxyConfig,
  options: { visitorId?: string } = {},
): Promise<Response> {
  if (!config.originUrl) {
    throw new Error("ORIGIN_URL is not configured");
  }

  const incoming = new URL(request.url);
  const upstreamUrl = buildUpstreamUrl(config.originUrl, incoming);
  const headers = buildUpstreamHeaders(
    request.headers,
    incoming,
    config.originUrl,
    options.visitorId,
  );

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    (init as RequestInit & { duplex?: string }).duplex = "half";
  }

  const upstream = await fetch(upstreamUrl.toString(), init);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: filterResponseHeaders(upstream.headers),
  });
}

export function buildUpstreamHeaders(
  source: Headers,
  incoming: URL,
  originBase: string,
  visitorId?: string,
): Headers {
  const headers = new Headers();
  for (const [key, value] of source.entries()) {
    const lower = key.toLowerCase();
    if (REQUEST_SKIP.has(lower)) {
      continue;
    }
    headers.append(key, value);
  }

  // Forward non-TideGuard cookies only (origin may need its own session).
  const sanitizedCookie = sanitizeCookieHeader(source.get("cookie"));
  if (sanitizedCookie) {
    headers.set("cookie", sanitizedCookie);
  }

  headers.set("host", new URL(originBase).host);
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));
  headers.set("x-tideguard-proxy", "1");
  if (visitorId) {
    headers.set("x-tideguard-visitor", visitorId);
  }

  return headers;
}

/** Drop TideGuard control cookies before forwarding to origin. */
export function sanitizeCookieHeader(cookie: string | null): string | null {
  if (!cookie) {
    return null;
  }
  const kept: string[] = [];
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const name = trimmed.split("=")[0]?.trim().toLowerCase() ?? "";
    if (name.startsWith("tg_")) {
      continue;
    }
    kept.push(trimmed);
  }
  return kept.length > 0 ? kept.join("; ") : null;
}

export function filterResponseHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const [key, value] of source.entries()) {
    if (RESPONSE_SKIP.has(key.toLowerCase())) {
      continue;
    }
    headers.append(key, value);
  }
  return headers;
}

/** Build the upstream URL without fetching (tests / debugging). */
export function buildProxyTarget(
  request: Request,
  config: OriginProxyConfig,
): { url: string; method: string } {
  if (!config.originUrl) {
    throw new Error("ORIGIN_URL is not configured");
  }
  const incoming = new URL(request.url);
  return {
    url: buildUpstreamUrl(config.originUrl, incoming).toString(),
    method: request.method,
  };
}
