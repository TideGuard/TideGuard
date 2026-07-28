/**
 * Compact HMAC admission tokens.
 *
 * Format: base64url(payload).base64url(signature)
 * Algorithm: HMAC-SHA256 over the payload segment only.
 *
 * We avoid a full JWT library to keep the Worker dependency-free and easy to
 * explain. Claims are still JWT-shaped (sub, queue, iat, exp) so they can be
 * migrated to standard JWTs later if needed.
 */

export interface AccessTokenClaims {
  /** Visitor id. */
  sub: string;
  /** Queue this token admits the visitor into. */
  queue: string;
  /** Expiry time (unix seconds). */
  exp: number;
  /** Issued-at time (unix seconds). */
  iat: number;
}

export class TokenError extends Error {
  readonly code: "invalid_token" | "expired_token";

  constructor(code: "invalid_token" | "expired_token", message: string) {
    super(message);
    this.name = "TokenError";
    this.code = code;
  }
}

export async function signAccessToken(claims: AccessTokenClaims, secret: string): Promise<string> {
  const payload = encodeJson(claims);
  const signature = await hmacSign(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyAccessToken(
  token: string,
  secret: string,
  options: { nowSeconds?: number; expectedQueue?: string } = {},
): Promise<AccessTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new TokenError("invalid_token", "Malformed access token");
  }

  const [payload, signature] = parts;
  const expected = await hmacSign(secret, payload);
  if (!(await timingSafeEqual(signature, expected))) {
    throw new TokenError("invalid_token", "Invalid access token signature");
  }

  let claims: AccessTokenClaims;
  try {
    claims = decodeJson<AccessTokenClaims>(payload);
  } catch {
    throw new TokenError("invalid_token", "Invalid access token payload");
  }

  if (!isClaimsShape(claims)) {
    throw new TokenError("invalid_token", "Invalid access token claims");
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    throw new TokenError("expired_token", "Access token has expired");
  }

  if (options.expectedQueue && claims.queue !== options.expectedQueue) {
    throw new TokenError("invalid_token", "Access token queue mismatch");
  }

  return claims;
}

export function buildAdmissionClaims(input: {
  visitorId: string;
  queue: string;
  tokenTTLSeconds: number;
  nowMs?: number;
}): AccessTokenClaims {
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  return {
    sub: input.visitorId,
    queue: input.queue,
    iat: nowSeconds,
    exp: nowSeconds + input.tokenTTLSeconds,
  };
}

function isClaimsShape(value: unknown): value is AccessTokenClaims {
  if (!value || typeof value !== "object") {
    return false;
  }
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.sub === "string" &&
    claims.sub.length > 0 &&
    typeof claims.queue === "string" &&
    claims.queue.length > 0 &&
    typeof claims.exp === "number" &&
    typeof claims.iat === "number"
  );
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const aBytes = textEncode(a);
  const bBytes = textEncode(b);
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
  return base64UrlEncode(textEncode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(textDecode(base64UrlDecode(value))) as T;
}

function textEncode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function textDecode(value: Uint8Array): string {
  return new TextDecoder().decode(value);
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
