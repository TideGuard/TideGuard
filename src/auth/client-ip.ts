/**
 * Visitor IP for allowlist decisions.
 *
 * Only trust Cloudflare's edge header. X-Forwarded-For is client-spoofable
 * and must not grant queue bypass.
 */

export function clientConnectingIp(request: Request): string | null {
  const raw = request.headers.get("cf-connecting-ip")?.trim();
  if (!raw) {
    return null;
  }
  return raw;
}

export function hasConnectingIpHeader(request: Request): boolean {
  return clientConnectingIp(request) !== null;
}
