/**
 * Central TideGuard secret resolution.
 *
 * Specialized secrets fall back to TOKEN_SECRET so existing deploys keep working.
 * Never log or return secret values beyond callers that already hold Env.
 */

import { ApiError } from "../core/errors";

const MIN_SECRET_LENGTH = 16;

type SecretEnv = {
  TOKEN_SECRET?: string;
  ADMISSION_SECRET?: string;
  ADMIN_SESSION_SECRET?: string;
  SEAL_SECRET?: string;
};

function readSecret(value: string | undefined): string | null {
  if (!value || value.length < MIN_SECRET_LENGTH) return null;
  return value;
}

function missingSecretMessage(name: string, fallbackHint: string): string {
  return `This Worker has no ${name} (or it is too short). ${fallbackHint}`;
}

/** Operator / emergency secret: claim, Bearer, X-TideGuard-Operator, factory reset. */
export function requireOperatorSecret(env: SecretEnv): string {
  const secret = readSecret(env.TOKEN_SECRET);
  if (!secret) {
    throw new ApiError(
      "invalid_config",
      missingSecretMessage(
        "TOKEN_SECRET",
        "Run npm run setup / set .dev.vars for local, or wrangler secret put TOKEN_SECRET for deploy, then restart.",
      ),
      500,
    );
  }
  return secret;
}

/** Visitor admission tokens and queue tickets. Falls back to TOKEN_SECRET. */
export function requireAdmissionSecret(env: SecretEnv): string {
  return readSecret(env.ADMISSION_SECRET) ?? requireOperatorSecret(env);
}

/** Administrator session cookies. Falls back to TOKEN_SECRET. */
export function requireAdminSessionSecret(env: SecretEnv): string {
  return readSecret(env.ADMIN_SESSION_SECRET) ?? requireOperatorSecret(env);
}

/** AES-GCM sealing of KV credentials. Falls back to TOKEN_SECRET. */
export function requireSealSecret(env: SecretEnv): string {
  return readSecret(env.SEAL_SECRET) ?? requireOperatorSecret(env);
}

/** True when a dedicated SEAL_SECRET is configured (not merely falling back). */
export function hasDedicatedSealSecret(env: SecretEnv): boolean {
  return readSecret(env.SEAL_SECRET) !== null;
}

/** True when a dedicated ADMISSION_SECRET is configured. */
export function hasDedicatedAdmissionSecret(env: SecretEnv): boolean {
  return readSecret(env.ADMISSION_SECRET) !== null;
}

/** True when a dedicated ADMIN_SESSION_SECRET is configured. */
export function hasDedicatedAdminSessionSecret(env: SecretEnv): boolean {
  return readSecret(env.ADMIN_SESSION_SECRET) !== null;
}

/**
 * @deprecated Prefer {@link requireOperatorSecret}. Kept for call sites that mean TOKEN_SECRET.
 */
export function requireTokenSecret(env: SecretEnv): string {
  return requireOperatorSecret(env);
}
