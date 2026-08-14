import {
  DEFAULT_BRANDING,
  mergeBranding,
  sanitizeGoogleAnalyticsId,
  sanitizeRedirectUrl,
  type WaitingRoomBranding,
} from "../core/branding";
import type { AdminConfig, AdminUser } from "./types";
import { ADMIN_CONFIG_KEY, brandingKey, normalizeUsername } from "./types";

/**
 * Read claimed admin config (setup may still be incomplete).
 * Returns null when no admin has claimed the Worker yet.
 */
export async function readAdminConfig(env: Env): Promise<AdminConfig | null> {
  try {
    const raw = await env.CONFIG_KV.get(ADMIN_CONFIG_KEY, "json");
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const config = raw as Partial<AdminConfig> & {
      passwordHash?: string;
      passwordSalt?: string;
    };
    if (typeof config.defaultQueue !== "string") {
      return null;
    }

    const users = normalizeUsers(config);
    if (users.length === 0) {
      return null;
    }

    const normalized: AdminConfig = {
      setupComplete: config.setupComplete === true,
      users,
      createdAt: typeof config.createdAt === "number" ? config.createdAt : 0,
      defaultQueue: config.defaultQueue,
      knownQueues: normalizeKnownQueues(config.defaultQueue, config.knownQueues),
    };

    // Persist migration away from legacy top-level password fields.
    if (
      config.passwordHash ||
      config.passwordSalt ||
      !Array.isArray(config.users) ||
      !Array.isArray(config.knownQueues)
    ) {
      await writeAdminConfig(env, normalized);
    }

    return normalized;
  } catch {
    return null;
  }
}

function normalizeUsers(config: Partial<AdminConfig>): AdminUser[] {
  if (Array.isArray(config.users) && config.users.length > 0) {
    const out: AdminUser[] = [];
    for (const user of config.users) {
      if (
        user &&
        typeof user.id === "string" &&
        typeof user.username === "string" &&
        typeof user.passwordHash === "string" &&
        typeof user.passwordSalt === "string"
      ) {
        const next: AdminUser = {
          id: user.id,
          username: normalizeUsername(user.username),
          passwordHash: user.passwordHash,
          passwordSalt: user.passwordSalt,
          createdAt: typeof user.createdAt === "number" ? user.createdAt : 0,
        };
        if (typeof user.recoveryHash === "string" && typeof user.recoverySalt === "string") {
          next.recoveryHash = user.recoveryHash;
          next.recoverySalt = user.recoverySalt;
        }
        if (
          typeof user.acceptedTosVersion === "number" &&
          Number.isFinite(user.acceptedTosVersion)
        ) {
          next.acceptedTosVersion = user.acceptedTosVersion;
        }
        out.push(next);
      }
    }
    return out;
  }

  if (typeof config.passwordHash === "string" && typeof config.passwordSalt === "string") {
    return [
      {
        id: "legacy-admin",
        username: "admin",
        passwordHash: config.passwordHash,
        passwordSalt: config.passwordSalt,
        createdAt: typeof config.createdAt === "number" ? config.createdAt : 0,
      },
    ];
  }

  return [];
}

export async function writeAdminConfig(env: Env, config: AdminConfig): Promise<void> {
  const payload: AdminConfig = {
    setupComplete: config.setupComplete === true,
    users: config.users,
    createdAt: config.createdAt,
    defaultQueue: config.defaultQueue,
    knownQueues: normalizeKnownQueues(config.defaultQueue, config.knownQueues),
  };
  await env.CONFIG_KV.put(ADMIN_CONFIG_KEY, JSON.stringify(payload));
}

function normalizeKnownQueues(defaultQueue: string, raw: unknown): string[] {
  const queues = Array.isArray(raw)
    ? raw.filter((queue): queue is string => typeof queue === "string")
    : [];
  return [...new Set([defaultQueue, ...queues])];
}

export async function rememberKnownQueue(env: Env, queue: string): Promise<void> {
  const config = await readAdminConfig(env);
  if (!config || config.knownQueues.includes(queue)) {
    return;
  }
  await writeAdminConfig(env, {
    ...config,
    knownQueues: [...config.knownQueues, queue],
  });
}

export async function clearAdminConfig(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(ADMIN_CONFIG_KEY);
}

/** True when an admin has claimed (password locked in), even if wizard is unfinished. */
export async function isAdminClaimed(env: Env): Promise<boolean> {
  return (await readAdminConfig(env)) !== null;
}

/** True when claim + Cloudflare + Turnstile + Finish have all completed. */
export async function isAdminSetupComplete(env: Env): Promise<boolean> {
  const config = await readAdminConfig(env);
  return config?.setupComplete === true;
}

export function findUserByUsername(config: AdminConfig, username: string): AdminUser | null {
  const needle = normalizeUsername(username);
  return config.users.find((u) => u.username === needle) ?? null;
}

export async function addAdminUser(env: Env, user: AdminUser): Promise<AdminConfig> {
  const config = await readAdminConfig(env);
  if (!config) {
    throw new Error("Admin has not been claimed");
  }
  if (findUserByUsername(config, user.username)) {
    throw new Error("Username is already taken");
  }
  const next: AdminConfig = {
    ...config,
    users: [...config.users, user],
  };
  await writeAdminConfig(env, next);
  return next;
}

export async function updateAdminUserPassword(
  env: Env,
  userId: string,
  passwordHash: string,
  passwordSalt: string,
): Promise<AdminConfig> {
  const config = await readAdminConfig(env);
  if (!config) {
    throw new Error("Admin has not been claimed");
  }
  const idx = config.users.findIndex((u) => u.id === userId);
  if (idx < 0) {
    throw new Error("User not found");
  }
  const users = [...config.users];
  const current = users[idx]!;
  users[idx] = { ...current, passwordHash, passwordSalt };
  const next: AdminConfig = { ...config, users };
  await writeAdminConfig(env, next);
  return next;
}

export async function updateAdminUserRecovery(
  env: Env,
  userId: string,
  recoveryHash: string,
  recoverySalt: string,
): Promise<AdminConfig> {
  const config = await readAdminConfig(env);
  if (!config) {
    throw new Error("Admin has not been claimed");
  }
  const idx = config.users.findIndex((u) => u.id === userId);
  if (idx < 0) {
    throw new Error("User not found");
  }
  const users = [...config.users];
  const current = users[idx]!;
  users[idx] = { ...current, recoveryHash, recoverySalt };
  const next: AdminConfig = { ...config, users };
  await writeAdminConfig(env, next);
  return next;
}

export async function updateAdminUserAcceptedTos(
  env: Env,
  userId: string,
  acceptedTosVersion: number,
): Promise<AdminConfig> {
  const config = await readAdminConfig(env);
  if (!config) {
    throw new Error("Admin has not been claimed");
  }
  const idx = config.users.findIndex((u) => u.id === userId);
  if (idx < 0) {
    throw new Error("User not found");
  }
  const users = [...config.users];
  const current = users[idx]!;
  users[idx] = { ...current, acceptedTosVersion };
  const next: AdminConfig = { ...config, users };
  await writeAdminConfig(env, next);
  return next;
}

export async function updateAdminUserPasswordAndRecovery(
  env: Env,
  userId: string,
  passwordHash: string,
  passwordSalt: string,
  recoveryHash: string,
  recoverySalt: string,
): Promise<AdminConfig> {
  const config = await readAdminConfig(env);
  if (!config) {
    throw new Error("Admin has not been claimed");
  }
  const idx = config.users.findIndex((u) => u.id === userId);
  if (idx < 0) {
    throw new Error("User not found");
  }
  const users = [...config.users];
  const current = users[idx]!;
  users[idx] = { ...current, passwordHash, passwordSalt, recoveryHash, recoverySalt };
  const next: AdminConfig = { ...config, users };
  await writeAdminConfig(env, next);
  return next;
}

export async function removeAdminUser(
  env: Env,
  userId: string,
  actorId: string,
): Promise<AdminConfig> {
  const config = await readAdminConfig(env);
  if (!config) {
    throw new Error("Admin has not been claimed");
  }
  if (userId === actorId) {
    throw new Error("You cannot remove your own account");
  }
  if (config.users.length <= 1) {
    throw new Error("Cannot remove the last admin");
  }
  if (!config.users.some((u) => u.id === userId)) {
    throw new Error("User not found");
  }
  const next: AdminConfig = {
    ...config,
    users: config.users.filter((u) => u.id !== userId),
  };
  await writeAdminConfig(env, next);
  return next;
}

export function findUserById(config: AdminConfig, userId: string): AdminUser | null {
  return config.users.find((u) => u.id === userId) ?? null;
}

export async function readBranding(env: Env, queue: string): Promise<WaitingRoomBranding> {
  try {
    const raw = await env.CONFIG_KV.get(brandingKey(queue), "json");
    if (!raw || typeof raw !== "object") {
      return DEFAULT_BRANDING;
    }
    return mergeBranding(raw as Partial<WaitingRoomBranding>);
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function writeBranding(
  env: Env,
  queue: string,
  branding: WaitingRoomBranding,
): Promise<void> {
  await Promise.all([
    env.CONFIG_KV.put(brandingKey(queue), JSON.stringify(branding)),
    rememberKnownQueue(env, queue),
  ]);
}

export function sanitizeBrandingInput(
  input: Partial<WaitingRoomBranding> | null | undefined,
): WaitingRoomBranding {
  const merged = mergeBranding(input ?? undefined);
  const holdRaw =
    typeof input?.admitHoldSeconds === "number" ? input.admitHoldSeconds : merged.admitHoldSeconds;
  const admitHoldSeconds = clampInt(holdRaw, 15, 900, DEFAULT_BRANDING.admitHoldSeconds);

  return {
    ...merged,
    primaryColor: sanitizeColor(merged.primaryColor, DEFAULT_BRANDING.primaryColor),
    backgroundColor: sanitizeColor(merged.backgroundColor, DEFAULT_BRANDING.backgroundColor),
    surfaceColor: sanitizeColor(merged.surfaceColor, DEFAULT_BRANDING.surfaceColor),
    textColor: sanitizeColor(merged.textColor, DEFAULT_BRANDING.textColor),
    mutedColor: sanitizeColor(merged.mutedColor, DEFAULT_BRANDING.mutedColor),
    accentColor: sanitizeColor(merged.accentColor, DEFAULT_BRANDING.accentColor),
    title: clampText(merged.title, 80) || DEFAULT_BRANDING.title,
    message: clampText(merged.message, 280) || DEFAULT_BRANDING.message,
    fontFamily: clampText(merged.fontFamily, 120) || DEFAULT_BRANDING.fontFamily,
    showWaitingCount: Boolean(merged.showWaitingCount),
    redirectUrl: sanitizeRedirectUrl(merged.redirectUrl, ""),
    requireClickToEnter: Boolean(merged.requireClickToEnter),
    admitHoldSeconds,
    enterButtonLabel: clampText(merged.enterButtonLabel, 40) || DEFAULT_BRANDING.enterButtonLabel,
    playTurnSound: Boolean(merged.playTurnSound),
    joinTurnstileEnabled: Boolean(merged.joinTurnstileEnabled),
    enableWebNotifications: Boolean(merged.enableWebNotifications),
    googleAnalyticsId: sanitizeGoogleAnalyticsId(merged.googleAnalyticsId),
  };
}

function sanitizeColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function clampText(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const n = Math.floor(value);
  if (n < min || n > max) {
    return fallback;
  }
  return n;
}

export function newAdminUserId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return bytesToHex(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
