/**
 * Encrypt small secrets for KV (Cloudflare API tokens) using TOKEN_SECRET.
 * AES-GCM; key = SHA-256(TOKEN_SECRET).
 */

import { base64UrlToBytes, bytesToBase64Url, textDecode, textEncode } from "../auth/crypto";

async function deriveKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", textEncode(secret));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Returns `v1.<iv>.<ciphertext>` (base64url segments). */
export async function sealSecret(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncode(plaintext));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(cipher))}`;
}

export async function openSecret(blob: string, secret: string): Promise<string> {
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) {
    throw new Error("Invalid sealed secret");
  }
  const key = await deriveKey(secret);
  const iv = base64UrlToBytes(parts[1]);
  const data = base64UrlToBytes(parts[2]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return textDecode(new Uint8Array(plain));
}
