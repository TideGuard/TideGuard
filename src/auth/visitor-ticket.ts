/**
 * Signed visitor tickets prove ownership of a queue slot (join → status/leave/heartbeat).
 * Separate from admission tokens so /status cannot mint access from visitorId alone.
 */

import { TokenError } from "./token";

export interface VisitorTicketClaims {
  typ: "ticket";
  sub: string;
  queue: string;
  iat: number;
  exp: number;
}

const keyCache = new Map<string, CryptoKey>();

export async function signVisitorTicket(
  input: { visitorId: string; queue: string; ttlSeconds: number; nowMs?: number },
  secret: string,
): Promise<string> {
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const claims: VisitorTicketClaims = {
    typ: "ticket",
    sub: input.visitorId,
    queue: input.queue,
    iat: nowSeconds,
    exp: nowSeconds + input.ttlSeconds,
  };
  const payload = encodeJson(claims);
  const signature = await hmacSign(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyVisitorTicket(
  token: string,
  secret: string,
  options: { expectedVisitorId?: string; expectedQueue?: string; nowSeconds?: number } = {},
): Promise<VisitorTicketClaims> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new TokenError("invalid_token", "Malformed visitor ticket");
  }
  const [payload, signature] = parts;
  const expected = await hmacSign(secret, payload);
  if (!(await timingSafeEqual(signature, expected))) {
    throw new TokenError("invalid_token", "Invalid visitor ticket signature");
  }

  let claims: VisitorTicketClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as VisitorTicketClaims;
  } catch {
    throw new TokenError("invalid_token", "Invalid visitor ticket payload");
  }

  if (
    claims.typ !== "ticket" ||
    typeof claims.sub !== "string" ||
    typeof claims.queue !== "string" ||
    typeof claims.exp !== "number" ||
    typeof claims.iat !== "number"
  ) {
    throw new TokenError("invalid_token", "Invalid visitor ticket claims");
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    throw new TokenError("expired_token", "Visitor ticket has expired");
  }
  if (options.expectedVisitorId && claims.sub !== options.expectedVisitorId) {
    throw new TokenError("invalid_token", "Visitor ticket mismatch");
  }
  if (options.expectedQueue && claims.queue !== options.expectedQueue) {
    throw new TokenError("invalid_token", "Visitor ticket queue mismatch");
  }

  return claims;
}

export function readTicketCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === "tg_ticket") {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  keyCache.set(secret, key);
  return key;
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
