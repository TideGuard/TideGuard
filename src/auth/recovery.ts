/**
 * BIP39 English recovery phrases for admin password reset.
 * Phrase is shown once; only a PBKDF2 verifier is stored (same as passwords).
 */

import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { ApiError } from "../core/errors";
import { hashPassword, verifyPassword } from "./password";

/** 128-bit entropy → 12 English words. */
export function generateRecoveryMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

export function normalizeMnemonic(raw: string): string {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

export function assertValidMnemonic(raw: string): string {
  const mnemonic = normalizeMnemonic(raw);
  const words = mnemonic.split(" ");
  if (words.length !== 12) {
    throw new ApiError("bad_request", "Recovery phrase must be exactly 12 words", 400);
  }
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new ApiError("bad_request", "Recovery phrase is not a valid BIP39 English mnemonic", 400);
  }
  return mnemonic;
}

export async function hashRecoveryMnemonic(
  mnemonic: string,
): Promise<{ hash: string; salt: string }> {
  return hashPassword(assertValidMnemonic(mnemonic));
}

export async function verifyRecoveryMnemonic(
  mnemonic: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  try {
    const normalized = assertValidMnemonic(mnemonic);
    return verifyPassword(normalized, hash, salt);
  } catch {
    return false;
  }
}

export async function createRecoveryVerifier(): Promise<{
  mnemonic: string;
  hash: string;
  salt: string;
}> {
  const mnemonic = generateRecoveryMnemonic();
  const { hash, salt } = await hashRecoveryMnemonic(mnemonic);
  return { mnemonic, hash, salt };
}
