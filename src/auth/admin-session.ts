/**
 * Signed admin session cookies (HMAC), separate from visitor admission tokens.
 */

import { TokenError } from "./token";

export const ADMIN_COOKIE = "tg_admin";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

export interface AdminSessionClaims {
  role: "admin";
  iat: number;
  exp: number;
}

export async function signAdminSession(
  secret: string,
  ttlSeconds = ADMIN_SESSION_TTL_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const claims: AdminSessionClaims = {
    role: "admin",
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };
  const payload = encodeJson(claims);
  const signature = await hmacSign(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyAdminSession(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AdminSessionClaims> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new TokenError("invalid_token", "Malformed admin session");
  }

  const [payload, signature] = parts;
  const expected = await hmacSign(secret, payload);
  if (!(await timingSafeEqual(signature, expected))) {
    throw new TokenError("invalid_token", "Invalid admin session signature");
  }

  let claims: AdminSessionClaims;
  try {
    claims = decodeJson<AdminSessionClaims>(payload);
  } catch {
    throw new TokenError("invalid_token", "Invalid admin session payload");
  }

  if (claims.role !== "admin" || typeof claims.exp !== "number" || typeof claims.iat !== "number") {
    throw new TokenError("invalid_token", "Invalid admin session claims");
  }

  if (claims.exp <= nowSeconds) {
    throw new TokenError("expired_token", "Admin session has expired");
  }

  return claims;
}

export function readAdminSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === ADMIN_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export function buildAdminSessionCookie(
  token: string,
  request: Request,
  maxAge = ADMIN_SESSION_TTL_SECONDS,
): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearAdminSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
