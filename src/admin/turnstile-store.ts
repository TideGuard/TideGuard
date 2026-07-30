/**
 * Turnstile sitekey + sealed secret for admin login / invite protection.
 */

import { requireTokenSecret } from "../auth/operator";
import { openSecret, sealSecret } from "./secret-box";

export const TURNSTILE_SETTINGS_KEY = "admin:turnstile";

const CACHE_TTL_MS = 5_000;
let cached: { at: number; value: TurnstileSettings | null } | null = null;

export interface TurnstileSettings {
  sitekey: string;
  secretSealed: string;
  accountId: string;
  domains: string[];
  createdAt: number;
}

export interface TurnstilePublicView {
  configured: boolean;
  sitekey: string | null;
  domains: string[];
}

const EMPTY: TurnstileSettings | null = null;

export function invalidateTurnstileCache(): void {
  cached = null;
}

export async function readTurnstileSettings(env: Env): Promise<TurnstileSettings | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const raw = await env.CONFIG_KV.get(TURNSTILE_SETTINGS_KEY, "json");
    const value = sanitize(raw);
    cached = { at: Date.now(), value };
    return value;
  } catch {
    cached = { at: Date.now(), value: EMPTY };
    return EMPTY;
  }
}

export async function writeTurnstileSettings(
  env: Env,
  input: {
    sitekey: string;
    secret: string;
    accountId: string;
    domains: string[];
  },
): Promise<TurnstileSettings> {
  const sitekey = input.sitekey.trim();
  const secret = input.secret.trim();
  if (!sitekey || !secret) {
    throw new TurnstileConfigError("Turnstile sitekey and secret are required");
  }
  const next: TurnstileSettings = {
    sitekey,
    secretSealed: await sealSecret(secret, requireTokenSecret(env)),
    accountId: input.accountId.trim(),
    domains: input.domains.map((d) => d.trim().toLowerCase()).filter(Boolean),
    createdAt: Date.now(),
  };
  await env.CONFIG_KV.put(TURNSTILE_SETTINGS_KEY, JSON.stringify(next));
  invalidateTurnstileCache();
  cached = { at: Date.now(), value: next };
  return next;
}

export async function clearTurnstileSettings(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(TURNSTILE_SETTINGS_KEY);
  invalidateTurnstileCache();
}

export async function readTurnstileSecret(env: Env): Promise<string | null> {
  const settings = await readTurnstileSettings(env);
  if (!settings) {
    return null;
  }
  try {
    return await openSecret(settings.secretSealed, requireTokenSecret(env));
  } catch {
    return null;
  }
}

export function toTurnstilePublicView(settings: TurnstileSettings | null): TurnstilePublicView {
  if (!settings) {
    return { configured: false, sitekey: null, domains: [] };
  }
  return {
    configured: true,
    sitekey: settings.sitekey,
    domains: settings.domains,
  };
}

export class TurnstileConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnstileConfigError";
  }
}

function sanitize(raw: unknown): TurnstileSettings | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.sitekey !== "string" ||
    !obj.sitekey.trim() ||
    typeof obj.secretSealed !== "string" ||
    !obj.secretSealed ||
    typeof obj.accountId !== "string"
  ) {
    return null;
  }
  return {
    sitekey: obj.sitekey.trim(),
    secretSealed: obj.secretSealed,
    accountId: obj.accountId.trim(),
    domains: Array.isArray(obj.domains)
      ? obj.domains.filter((d): d is string => typeof d === "string")
      : [],
    createdAt: typeof obj.createdAt === "number" ? obj.createdAt : 0,
  };
}
