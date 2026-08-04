/**
 * Operator outbound webhooks (pause / health / depth). Stored in CONFIG_KV.
 */

import { sealSecret, openSecret } from "./secret-box";

export const WEBHOOKS_KEY = "admin:webhooks";

export type WebhookEvent = "pause" | "health" | "depth";

export interface WebhookSettings {
  enabled: boolean;
  url: string | null;
  events: WebhookEvent[];
  /** Fire depth event when waiting count reaches this (inclusive). */
  depthThreshold: number;
  /** Sealed signing secret for X-TideGuard-Signature (optional). */
  sealedSecret?: string;
  updatedAt: number;
  /** Last depth fire waiting value (debounce while still above threshold). */
  lastDepthFiredAt?: number;
}

export const DEFAULT_WEBHOOK_SETTINGS: WebhookSettings = {
  enabled: false,
  url: null,
  events: ["pause", "health", "depth"],
  depthThreshold: 100,
  updatedAt: 0,
};

const ALL_EVENTS: WebhookEvent[] = ["pause", "health", "depth"];

export function parseWebhookEvents(raw: unknown): WebhookEvent[] {
  if (!Array.isArray(raw)) return [...DEFAULT_WEBHOOK_SETTINGS.events];
  const out: WebhookEvent[] = [];
  for (const item of raw) {
    if (typeof item === "string" && (ALL_EVENTS as string[]).includes(item)) {
      out.push(item as WebhookEvent);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_WEBHOOK_SETTINGS.events];
}

export async function readWebhookSettings(env: Env): Promise<WebhookSettings> {
  try {
    const raw = await env.CONFIG_KV.get(WEBHOOKS_KEY, "json");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_WEBHOOK_SETTINGS };
    const o = raw as Partial<WebhookSettings>;
    const settings: WebhookSettings = {
      enabled: o.enabled === true,
      url: typeof o.url === "string" && o.url.startsWith("https://") ? o.url : null,
      events: parseWebhookEvents(o.events),
      depthThreshold:
        typeof o.depthThreshold === "number" && o.depthThreshold >= 1
          ? Math.floor(o.depthThreshold)
          : DEFAULT_WEBHOOK_SETTINGS.depthThreshold,
      updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : 0,
    };
    if (typeof o.sealedSecret === "string") {
      settings.sealedSecret = o.sealedSecret;
    }
    if (typeof o.lastDepthFiredAt === "number") {
      settings.lastDepthFiredAt = o.lastDepthFiredAt;
    }
    return settings;
  } catch {
    return { ...DEFAULT_WEBHOOK_SETTINGS };
  }
}

export async function writeWebhookSettings(env: Env, settings: WebhookSettings): Promise<void> {
  await env.CONFIG_KV.put(WEBHOOKS_KEY, JSON.stringify(settings));
}

export async function clearWebhookSettings(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(WEBHOOKS_KEY);
}

export function toPublicWebhooks(settings: WebhookSettings): Omit<
  WebhookSettings,
  "sealedSecret"
> & {
  hasSecret: boolean;
} {
  const { sealedSecret: _, ...rest } = settings;
  return { ...rest, hasSecret: Boolean(settings.sealedSecret) };
}

export async function sealWebhookSecret(env: Env, plain: string): Promise<string> {
  return sealSecret(plain, env.TOKEN_SECRET);
}

export async function openWebhookSecret(env: Env, sealed: string): Promise<string | null> {
  try {
    return await openSecret(sealed, env.TOKEN_SECRET);
  } catch {
    return null;
  }
}
