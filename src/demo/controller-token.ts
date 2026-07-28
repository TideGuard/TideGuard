/**
 * HMAC controller tokens for the isolated live demo.
 * Separate from admin sessions and visitor admission tokens.
 */

import { TokenError } from "../auth/token";

export interface DemoControllerClaims {
  typ: "demo_ctrl";
  sid: string;
  iat: number;
  exp: number;
}

const keyCache = new Map<string, CryptoKey>();

export async function signDemoControllerToken(
  sessionId: string,
  secret: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): Promise<string> {
  const nowSeconds = Math.floor(nowMs / 1000);
  const claims: DemoControllerClaims = {
    typ: "demo_ctrl",
    sid: sessionId,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };
  const payload = encodeJson(claims);
  const signature = await hmacSign(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyDemoControllerToken(
  token: string,
  secret: string,
  expectedSessionId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<DemoControllerClaims> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new TokenError("invalid_token", "Malformed demo controller token");
  }
  const [payload, signature] = parts;
  const expected = await hmacSign(secret, payload);
  if (!(await timingSafeEqual(signature, expected))) {
    throw new TokenError("invalid_token", "Invalid demo controller token");
  }

  let claims: DemoControllerClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as DemoControllerClaims;
  } catch {
    throw new TokenError("invalid_token", "Invalid demo controller payload");
  }

  if (
    claims.typ !== "demo_ctrl" ||
    typeof claims.sid !== "string" ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number"
  ) {
    throw new TokenError("invalid_token", "Invalid demo controller claims");
  }
  if (claims.sid !== expectedSessionId) {
    throw new TokenError("invalid_token", "Demo controller session mismatch");
  }
  if (claims.exp <= nowSeconds) {
    throw new TokenError("expired_token", "Demo controller token has expired");
  }
  return claims;
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(sig));
}

async function getKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached) {
    return cached;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  keyCache.set(secret, key);
  return key;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}
