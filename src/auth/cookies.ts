/**
 * Access-cookie and visitor-ticket helpers (HttpOnly, SameSite=Lax).
 */

export const ACCESS_COOKIE = "tg_access";
export const TICKET_COOKIE = "tg_ticket";

export function buildAccessCookie(token: string, request: Request, maxAgeSeconds: number): string {
  return buildCookie(ACCESS_COOKIE, token, request, maxAgeSeconds);
}

export function buildTicketCookie(token: string, request: Request, maxAgeSeconds: number): string {
  return buildCookie(TICKET_COOKIE, token, request, maxAgeSeconds);
}

export function clearAccessCookie(request: Request): string {
  return buildCookie(ACCESS_COOKIE, "", request, 0);
}

function buildCookie(name: string, value: string, request: Request, maxAgeSeconds: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const encoded = encodeURIComponent(value);
  return `${name}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function securityHeaders(): HeadersInit {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy":
      "default-src 'self'; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'self'",
  };
}

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function appendSetCookies(response: Response, cookies: string[]): Response {
  if (cookies.length === 0) {
    return response;
  }
  const headers = new Headers(response.headers);
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Extract a bearer token from Authorization, query string, or cookie.
 */
export function extractAccessToken(request: Request, url: URL): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
  }

  const queryToken = url.searchParams.get("accessToken");
  if (queryToken) {
    return queryToken;
  }

  const cookie = request.headers.get("cookie");
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)tg_access=([^;]+)/);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}
