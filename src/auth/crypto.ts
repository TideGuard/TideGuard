/**
 * Shared HMAC / base64url helpers for admission tokens, admin sessions, and visitor tickets.
 * Keep crypto primitives here so timing-safe compares and encoding cannot drift across modules.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const hmacKeyCache = new Map<string, CryptoKey>();

export function textEncode(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function textDecode(value: Uint8Array): string {
  return textDecoder.decode(value);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeJson(value: unknown): string {
  return bytesToBase64Url(textEncode(JSON.stringify(value)));
}

export function decodeJson<T>(value: string): T {
  return JSON.parse(textDecode(base64UrlToBytes(value))) as T;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const cached = hmacKeyCache.get(secret);
  if (cached) {
    return cached;
  }
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

export async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

/** Constant-time compare for equal-length strings (HMAC digests, secrets). */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
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

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
