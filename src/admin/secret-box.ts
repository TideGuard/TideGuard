/**
 * Encrypt small secrets for KV (Cloudflare API tokens, Turnstile, webhooks).
 * AES-GCM; key = SHA-256(secret).
 *
 * v1 blobs were sealed with TOKEN_SECRET (legacy).
 * v2 blobs are sealed with SEAL_SECRET (or TOKEN_SECRET fallback when SEAL is unset).
 */

import { hasDedicatedSealSecret, requireOperatorSecret, requireSealSecret } from "../auth/secrets";
import { base64UrlToBytes, bytesToBase64Url, textDecode, textEncode } from "../auth/crypto";

export type SealVersion = "v1" | "v2";

async function deriveKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", textEncode(secret));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export function sealedVersion(blob: string): SealVersion | null {
  const version = blob.split(".")[0];
  if (version === "v1" || version === "v2") return version;
  return null;
}

/** Returns `v1|v2.<iv>.<ciphertext>` (base64url segments). Default version is v2. */
export async function sealSecret(
  plaintext: string,
  secret: string,
  version: SealVersion = "v2",
): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncode(plaintext));
  return `${version}.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(cipher))}`;
}

export async function openSecret(blob: string, secret: string): Promise<string> {
  const parts = blob.split(".");
  const version = parts[0];
  if (parts.length !== 3 || (version !== "v1" && version !== "v2") || !parts[1] || !parts[2]) {
    throw new Error("Invalid sealed secret");
  }
  const key = await deriveKey(secret);
  const iv = base64UrlToBytes(parts[1]);
  const data = base64UrlToBytes(parts[2]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return textDecode(new Uint8Array(plain));
}

/**
 * Seal a credential for KV: v2 with SEAL_SECRET when dedicated; otherwise v1 with TOKEN_SECRET
 * so TOKEN_SECRET-only deploys keep writing the legacy format.
 */
export async function sealCredential(env: Env, plaintext: string): Promise<string> {
  if (hasDedicatedSealSecret(env)) {
    return sealSecret(plaintext, requireSealSecret(env), "v2");
  }
  return sealSecret(plaintext, requireOperatorSecret(env), "v1");
}

/**
 * Open a sealed credential. v2 uses SEAL_SECRET (fallback TOKEN_SECRET); v1 uses TOKEN_SECRET.
 * Throws on invalid blob or decryption failure — callers must not erase KV on failure.
 */
export async function openCredential(env: Env, blob: string): Promise<string> {
  const version = sealedVersion(blob);
  if (version === "v2") {
    return openSecret(blob, requireSealSecret(env));
  }
  if (version === "v1") {
    return openSecret(blob, requireOperatorSecret(env));
  }
  throw new Error("Invalid sealed secret");
}

/**
 * Open a credential; when a dedicated SEAL_SECRET exists and the blob is legacy v1,
 * return a v2 reseal so callers can persist the upgrade. Never clears stored values.
 */
export async function openCredentialWithMigration(
  env: Env,
  blob: string,
): Promise<{ plaintext: string; resealed: string | null }> {
  const plaintext = await openCredential(env, blob);
  if (sealedVersion(blob) === "v1" && hasDedicatedSealSecret(env)) {
    return {
      plaintext,
      resealed: await sealSecret(plaintext, requireSealSecret(env), "v2"),
    };
  }
  return { plaintext, resealed: null };
}
