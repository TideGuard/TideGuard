/**
 * Signed admin session cookies (HMAC), separate from visitor admission tokens.
 */

import { decodeJson, encodeJson, hmacSign, timingSafeEqual } from "./crypto";
import { TokenError } from "./token";

export const ADMIN_COOKIE = "tg_admin";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

export interface AdminSessionClaims {
  role: "admin";
  sub: string;
  username: string;
  iat: number;
  exp: number;
}

export interface AdminActor {
  id: string;
  username: string;
}

export async function signAdminSession(
  secret: string,
  actor: AdminActor,
  ttlSeconds = ADMIN_SESSION_TTL_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const claims: AdminSessionClaims = {
    role: "admin",
    sub: actor.id,
    username: actor.username,
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

  if (
    claims.role !== "admin" ||
    typeof claims.exp !== "number" ||
    typeof claims.iat !== "number" ||
    typeof claims.sub !== "string" ||
    typeof claims.username !== "string" ||
    claims.sub.length === 0 ||
    claims.username.length === 0
  ) {
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
