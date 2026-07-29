import {
  DEFAULT_BRANDING,
  mergeBranding,
  sanitizeRedirectUrl,
  type WaitingRoomBranding,
} from "../core/branding";
import type { AdminConfig } from "./types";
import { ADMIN_CONFIG_KEY, brandingKey } from "./types";

export async function readAdminConfig(env: Env): Promise<AdminConfig | null> {
  try {
    const raw = await env.CONFIG_KV.get(ADMIN_CONFIG_KEY, "json");
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const config = raw as Partial<AdminConfig>;
    if (
      config.setupComplete !== true ||
      typeof config.passwordHash !== "string" ||
      typeof config.passwordSalt !== "string" ||
      typeof config.defaultQueue !== "string"
    ) {
      return null;
    }
    return {
      setupComplete: true,
      passwordHash: config.passwordHash,
      passwordSalt: config.passwordSalt,
      createdAt: typeof config.createdAt === "number" ? config.createdAt : 0,
      defaultQueue: config.defaultQueue,
    };
  } catch {
    return null;
  }
}

export async function writeAdminConfig(env: Env, config: AdminConfig): Promise<void> {
  await env.CONFIG_KV.put(ADMIN_CONFIG_KEY, JSON.stringify(config));
}

export async function clearAdminConfig(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(ADMIN_CONFIG_KEY);
}

export async function isAdminSetupComplete(env: Env): Promise<boolean> {
  return (await readAdminConfig(env)) !== null;
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
