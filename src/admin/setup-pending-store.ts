/**
 * Wizard-phase pending Cloudflare + Turnstile state (Bearer TOKEN_SECRET gated).
 * Promoted into permanent stores on Finish setup; cleared on reset.
 */

import { openCredentialWithMigration, sealCredential } from "./secret-box";

export const SETUP_PENDING_KEY = "admin:setup-pending";

export interface SetupPendingCloudflare {
  zoneId: string;
  hostname: string;
  accountId: string;
  workerService: string;
  /** Sealed API token. */
  apiTokenSealed: string;
  verifiedAt: number;
  proxyOk: boolean;
  sslMode: string | null;
  sslIsStrict: boolean;
  hostnameAttached: boolean;
}

export interface SetupPendingTurnstile {
  sitekey: string;
  secretSealed: string;
  domains: string[];
  accountId: string;
  verifiedAt: number;
}

export interface SetupPending {
  cloudflare: SetupPendingCloudflare | null;
  turnstile: SetupPendingTurnstile | null;
  updatedAt: number;
}

const EMPTY: SetupPending = {
  cloudflare: null,
  turnstile: null,
  updatedAt: 0,
};

export async function readSetupPending(env: Env): Promise<SetupPending> {
  try {
    const raw = await env.CONFIG_KV.get(SETUP_PENDING_KEY, "json");
    return sanitize(raw);
  } catch {
    return { ...EMPTY };
  }
}

export async function clearSetupPending(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(SETUP_PENDING_KEY);
}

export async function writeSetupPendingApiToken(env: Env, apiToken: string): Promise<SetupPending> {
  const current = await readSetupPending(env);
  const sealed = await sealCredential(env, apiToken.trim());
  const next: SetupPending = {
    ...current,
    cloudflare: current.cloudflare
      ? { ...current.cloudflare, apiTokenSealed: sealed, verifiedAt: Date.now() }
      : {
          zoneId: "",
          hostname: "",
          accountId: "",
          workerService: "tideguard",
          apiTokenSealed: sealed,
          verifiedAt: Date.now(),
          proxyOk: false,
          sslMode: null,
          sslIsStrict: false,
          hostnameAttached: false,
        },
    updatedAt: Date.now(),
  };
  await env.CONFIG_KV.put(SETUP_PENDING_KEY, JSON.stringify(next));
  return next;
}

export async function writeSetupPendingCloudflare(
  env: Env,
  input: {
    zoneId: string;
    hostname: string;
    accountId: string;
    workerService: string;
    apiToken: string;
    proxyOk: boolean;
    sslMode: string | null;
    sslIsStrict: boolean;
    hostnameAttached: boolean;
  },
): Promise<SetupPending> {
  const current = await readSetupPending(env);
  const next: SetupPending = {
    ...current,
    cloudflare: {
      zoneId: input.zoneId.trim(),
      hostname: input.hostname.replace(/\.$/, "").toLowerCase(),
      accountId: input.accountId.trim(),
      workerService: input.workerService.trim() || "tideguard",
      apiTokenSealed: await sealCredential(env, input.apiToken.trim()),
      verifiedAt: Date.now(),
      proxyOk: input.proxyOk,
      sslMode: input.sslMode,
      sslIsStrict: input.sslIsStrict,
      hostnameAttached: input.hostnameAttached,
    },
    updatedAt: Date.now(),
  };
  await env.CONFIG_KV.put(SETUP_PENDING_KEY, JSON.stringify(next));
  return next;
}

export async function writeSetupPendingTurnstile(
  env: Env,
  input: {
    sitekey: string;
    secret: string;
    domains: string[];
    accountId: string;
    verified: boolean;
  },
): Promise<SetupPending> {
  const current = await readSetupPending(env);
  if (!current.cloudflare) {
    throw new SetupPendingError("Verify Cloudflare access before provisioning Turnstile");
  }
  const next: SetupPending = {
    ...current,
    turnstile: {
      sitekey: input.sitekey.trim(),
      secretSealed: await sealCredential(env, input.secret.trim()),
      domains: input.domains.map((d) => d.trim().toLowerCase()).filter(Boolean),
      accountId: input.accountId.trim(),
      verifiedAt: input.verified ? Date.now() : 0,
    },
    updatedAt: Date.now(),
  };
  await env.CONFIG_KV.put(SETUP_PENDING_KEY, JSON.stringify(next));
  return next;
}

export async function markSetupPendingTurnstileVerified(env: Env): Promise<SetupPending> {
  const current = await readSetupPending(env);
  if (!current.turnstile) {
    throw new SetupPendingError("Provision Turnstile before verifying");
  }
  const next: SetupPending = {
    ...current,
    turnstile: { ...current.turnstile, verifiedAt: Date.now() },
    updatedAt: Date.now(),
  };
  await env.CONFIG_KV.put(SETUP_PENDING_KEY, JSON.stringify(next));
  return next;
}

export async function openSetupPendingApiToken(env: Env): Promise<string | null> {
  const pending = await readSetupPending(env);
  if (!pending.cloudflare?.apiTokenSealed) {
    return null;
  }
  try {
    const { plaintext, resealed } = await openCredentialWithMigration(
      env,
      pending.cloudflare.apiTokenSealed,
    );
    if (resealed && pending.cloudflare && resealed !== pending.cloudflare.apiTokenSealed) {
      const next: SetupPending = {
        ...pending,
        cloudflare: { ...pending.cloudflare, apiTokenSealed: resealed },
        updatedAt: Date.now(),
      };
      await env.CONFIG_KV.put(SETUP_PENDING_KEY, JSON.stringify(next));
    }
    return plaintext;
  } catch {
    // Do not erase the sealed blob on decrypt failure.
    return null;
  }
}

export async function openSetupPendingTurnstileSecret(env: Env): Promise<string | null> {
  const pending = await readSetupPending(env);
  if (!pending.turnstile?.secretSealed) {
    return null;
  }
  try {
    const { plaintext, resealed } = await openCredentialWithMigration(
      env,
      pending.turnstile.secretSealed,
    );
    if (resealed && pending.turnstile && resealed !== pending.turnstile.secretSealed) {
      const next: SetupPending = {
        ...pending,
        turnstile: { ...pending.turnstile, secretSealed: resealed },
        updatedAt: Date.now(),
      };
      await env.CONFIG_KV.put(SETUP_PENDING_KEY, JSON.stringify(next));
    }
    return plaintext;
  } catch {
    // Do not erase the sealed blob on decrypt failure.
    return null;
  }
}

export function isSetupPendingReady(pending: SetupPending): boolean {
  return Boolean(
    pending.cloudflare?.zoneId &&
    pending.cloudflare.accountId &&
    pending.cloudflare.apiTokenSealed &&
    pending.cloudflare.proxyOk &&
    pending.turnstile?.sitekey &&
    pending.turnstile.secretSealed &&
    pending.turnstile.verifiedAt > 0,
  );
}

export function toSetupPendingPublic(pending: SetupPending): SetupPendingPublic {
  return {
    apiTokenReady: Boolean(pending.cloudflare?.apiTokenSealed),
    cloudflareReady: Boolean(pending.cloudflare?.proxyOk && pending.cloudflare.apiTokenSealed),
    turnstileReady: Boolean(pending.turnstile?.verifiedAt && pending.turnstile.verifiedAt > 0),
    turnstileSitekey: pending.turnstile?.sitekey ?? null,
    proxyOk: pending.cloudflare?.proxyOk ?? false,
    sslIsStrict: pending.cloudflare?.sslIsStrict ?? false,
    sslMode: pending.cloudflare?.sslMode ?? null,
    hostnameAttached: pending.cloudflare?.hostnameAttached ?? false,
    hostname: pending.cloudflare?.hostname || null,
    zoneId: pending.cloudflare?.zoneId || null,
    accountId: pending.cloudflare?.accountId || null,
  };
}

export interface SetupPendingPublic {
  apiTokenReady: boolean;
  cloudflareReady: boolean;
  turnstileReady: boolean;
  turnstileSitekey: string | null;
  proxyOk: boolean;
  sslIsStrict: boolean;
  sslMode: string | null;
  hostnameAttached: boolean;
  hostname: string | null;
  zoneId: string | null;
  accountId: string | null;
}

export class SetupPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupPendingError";
  }
}

/**
 * Seed ready pending state for tests (uses Cloudflare always-pass Turnstile keys).
 */
export async function seedSetupPendingForTests(
  env: Env,
  overrides?: Partial<{
    zoneId: string;
    hostname: string;
    accountId: string;
    apiToken: string;
    sitekey: string;
    secret: string;
  }>,
): Promise<SetupPending> {
  const { TURNSTILE_TEST_PASS_SECRET, TURNSTILE_TEST_PASS_SITEKEY } =
    await import("./cloudflare-api");
  const apiToken = overrides?.apiToken ?? "cf-test-token-at-least-20-chars";
  await writeSetupPendingCloudflare(env, {
    zoneId: overrides?.zoneId ?? "0123456789abcdef0123456789abcdef",
    hostname: overrides?.hostname ?? "example.com",
    accountId: overrides?.accountId ?? "acct0123456789abcdef0123456789",
    workerService: "tideguard",
    apiToken,
    proxyOk: true,
    sslMode: "strict",
    sslIsStrict: true,
    hostnameAttached: true,
  });
  await writeSetupPendingTurnstile(env, {
    sitekey: overrides?.sitekey ?? TURNSTILE_TEST_PASS_SITEKEY,
    secret: overrides?.secret ?? TURNSTILE_TEST_PASS_SECRET,
    domains: ["localhost", "127.0.0.1", "example.com"],
    accountId: overrides?.accountId ?? "acct0123456789abcdef0123456789",
    verified: true,
  });
  return readSetupPending(env);
}

function sanitize(raw: unknown): SetupPending {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY };
  }
  const obj = raw as Record<string, unknown>;
  return {
    cloudflare: sanitizeCloudflare(obj.cloudflare),
    turnstile: sanitizeTurnstile(obj.turnstile),
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : 0,
  };
}

function sanitizeCloudflare(raw: unknown): SetupPendingCloudflare | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.zoneId !== "string" ||
    typeof o.hostname !== "string" ||
    typeof o.accountId !== "string" ||
    typeof o.apiTokenSealed !== "string"
  ) {
    return null;
  }
  return {
    zoneId: o.zoneId,
    hostname: o.hostname,
    accountId: o.accountId,
    workerService: typeof o.workerService === "string" ? o.workerService : "tideguard",
    apiTokenSealed: o.apiTokenSealed,
    verifiedAt: typeof o.verifiedAt === "number" ? o.verifiedAt : 0,
    proxyOk: o.proxyOk === true,
    sslMode: typeof o.sslMode === "string" ? o.sslMode : null,
    sslIsStrict: o.sslIsStrict === true,
    hostnameAttached: o.hostnameAttached === true,
  };
}

function sanitizeTurnstile(raw: unknown): SetupPendingTurnstile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.sitekey !== "string" ||
    typeof o.secretSealed !== "string" ||
    typeof o.accountId !== "string"
  ) {
    return null;
  }
  return {
    sitekey: o.sitekey,
    secretSealed: o.secretSealed,
    domains: Array.isArray(o.domains)
      ? o.domains.filter((d): d is string => typeof d === "string")
      : [],
    accountId: o.accountId,
    verifiedAt: typeof o.verifiedAt === "number" ? o.verifiedAt : 0,
  };
}
