/**
 * Signing / sealing secret helpers.
 * TOKEN_SECRET always signs visitor tickets and access tokens.
 * Optional ADMIN_SECRET signs admin sessions, operator Bearer, and KV seals.
 */

import { ApiError } from "../core/errors";
import { openSecret, sealSecret } from "../admin/secret-box";

export type OpenAdminSecretResult = {
  plaintext: string;
  /** True when ADMIN_SECRET is set but the blob still opened with TOKEN_SECRET. */
  usedTokenSecretFallback: boolean;
};

/** Visitor admission HMAC (always TOKEN_SECRET). */
export function visitorSecret(env: Env): string {
  const secret = env.TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new ApiError(
      "invalid_config",
      "This Worker has no TOKEN_SECRET (or it is too short). Run npm run setup / set .dev.vars for local, or wrangler secret put TOKEN_SECRET for deploy, then restart.",
      500,
    );
  }
  return secret;
}

/** Admin sessions, operator Bearer, and KV sealing. Falls back to TOKEN_SECRET. */
export function adminSecret(env: Env): string {
  const admin = env.ADMIN_SECRET?.trim();
  if (admin && admin.length >= 16) {
    return admin;
  }
  return visitorSecret(env);
}

export async function sealWithAdminSecret(env: Env, plaintext: string): Promise<string> {
  return sealSecret(plaintext, adminSecret(env));
}

/**
 * Decrypt with ADMIN_SECRET first, then TOKEN_SECRET (migration / dual-open).
 * Callers that persist seals should re-seal when `usedTokenSecretFallback` is true.
 */
export async function openWithAdminSecretDetailed(
  env: Env,
  blob: string,
): Promise<OpenAdminSecretResult> {
  const admin = env.ADMIN_SECRET?.trim();
  if (admin && admin.length >= 16) {
    try {
      return { plaintext: await openSecret(blob, admin), usedTokenSecretFallback: false };
    } catch {
      /* try TOKEN_SECRET */
    }
    const plaintext = await openSecret(blob, visitorSecret(env));
    console.warn(
      "[TideGuard] Sealed KV credential opened with TOKEN_SECRET while ADMIN_SECRET is set; re-sealing on next save/read migrates it.",
    );
    return { plaintext, usedTokenSecretFallback: true };
  }
  return { plaintext: await openSecret(blob, visitorSecret(env)), usedTokenSecretFallback: false };
}

/** Decrypt with ADMIN_SECRET first, then TOKEN_SECRET (migration / dual-open). */
export async function openWithAdminSecret(env: Env, blob: string): Promise<string> {
  const opened = await openWithAdminSecretDetailed(env, blob);
  return opened.plaintext;
}
