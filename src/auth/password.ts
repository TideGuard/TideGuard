/**
 * PBKDF2 password hashing for the admin setup wizard.
 * Uses Web Crypto so the Worker stays dependency-free.
 */

import { base64UrlToBytes, bytesToBase64Url, timingSafeEqualBytes } from "./crypto";

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt);
  return { hash: bytesToBase64Url(hash), salt: bytesToBase64Url(salt) };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const saltBytes = base64UrlToBytes(salt);
  const expected = base64UrlToBytes(hash);
  const actual = await derive(password, saltBytes);
  return timingSafeEqualBytes(actual, expected);
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}
