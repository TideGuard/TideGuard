import {
  DEFAULT_BRANDING,
  mergeBranding,
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
    };

    // Persist migration away from legacy top-level password fields.
    if (config.passwordHash || config.passwordSalt || !Array.isArray(config.users)) {
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
        out.push({
          id: user.id,
          username: normalizeUsername(user.username),
          passwordHash: user.passwordHash,
          passwordSalt: user.passwordSalt,
          createdAt: typeof user.createdAt === "number" ? user.createdAt : 0,
        });
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
  };
  await env.CONFIG_KV.put(ADMIN_CONFIG_KEY, JSON.stringify(payload));
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
  await env.CONFIG_KV.put(brandingKey(queue), JSON.stringify(branding));
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
