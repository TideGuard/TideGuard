/**
 * npm extract of TideGuard's Worker token implementation.
 * Keep behavior aligned with src/auth/crypto.ts and src/auth/token.ts.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const hmacKeyCache = new Map();

export class TokenError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TokenError";
    this.code = code;
  }
}

export function textEncode(value) {
  return textEncoder.encode(value);
}

export function textDecode(value) {
  return textDecoder.decode(value);
}

export function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function base64UrlToBytes(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeJson(value) {
  return bytesToBase64Url(textEncode(JSON.stringify(value)));
}

export function decodeJson(value) {
  return JSON.parse(textDecode(base64UrlToBytes(value)));
}

async function getHmacKey(secret) {
  const cached = hmacKeyCache.get(secret);
  if (cached) return cached;
  const key = await crypto.subtle.importKey(
    "raw",
    textEncode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  hmacKeyCache.set(secret, key);
  return key;
}

export async function hmacSign(secret, payload) {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function timingSafeEqual(a, b) {
  const aBytes = textEncode(a);
  const bBytes = textEncode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export async function signAccessToken(claims, secret) {
  const payload = encodeJson(claims);
  const signature = await hmacSign(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyAccessToken(token, secret, options = {}) {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new TokenError("invalid_token", "Malformed access token");
  }
  const [payload, signature] = parts;
  const expected = await hmacSign(secret, payload);
  if (!(await timingSafeEqual(signature, expected))) {
    throw new TokenError("invalid_token", "Invalid access token signature");
  }

  let claims;
  try {
    claims = decodeJson(payload);
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
  if (options.expectedEpoch !== undefined && (claims.epoch ?? 0) !== options.expectedEpoch) {
    throw new TokenError("invalid_token", "Access token has been revoked");
  }
  return claims;
}

export function buildAdmissionClaims(input) {
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  return {
    sub: input.visitorId,
    queue: input.queue,
    iat: nowSeconds,
    exp: nowSeconds + input.tokenTTLSeconds,
    epoch: input.epoch ?? 0,
  };
}

function isClaimsShape(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.sub === "string" &&
    value.sub.length > 0 &&
    typeof value.queue === "string" &&
    value.queue.length > 0 &&
    typeof value.exp === "number" &&
    typeof value.iat === "number" &&
    (value.epoch === undefined ||
      (typeof value.epoch === "number" && Number.isInteger(value.epoch) && value.epoch >= 0))
  );
}
