/**
 * Operator outbound webhooks. Stored in CONFIG_KV.
 */

import { isBlockedOriginHost } from "../core/origin";
import { openWithAdminSecretDetailed, sealWithAdminSecret } from "../auth/secrets";

export const WEBHOOKS_KEY = "admin:webhooks";

export type WebhookEvent =
  | "pause"
  | "health"
  | "depth"
  | "opened"
  | "origin_unhealthy"
  | "queue_full"
  | "admit_rate_changed"
  | "schedule_open"
  | "depth_cleared"
  | "test";

export interface WebhookLastDelivery {
  at: number;
  status: number | null;
  error: string | null;
  event: WebhookEvent;
}

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
  /** Queues currently reported auto-paused, used to debounce transition events. */
  originUnhealthyQueues?: string[];
  /** Last queue_full fire (time-debounce while capacity stays full). */
  lastQueueFullFiredAt?: number;
  /** True while opensAt is in the future (for schedule_open edge). */
  waitingForScheduleOpen?: boolean;
  lastDelivery?: WebhookLastDelivery;
}

/** Public https URL with the same SSRF host blocklist as origin URLs. */
export function sanitizeWebhookUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (isBlockedOriginHost(parsed.hostname)) return null;
  return parsed.toString();
}

export const DEFAULT_WEBHOOK_SETTINGS: WebhookSettings = {
  enabled: false,
  url: null,
  events: ["pause", "health", "depth"],
  depthThreshold: 100,
  updatedAt: 0,
};

const ALL_EVENTS: WebhookEvent[] = [
  "pause",
  "health",
  "depth",
  "opened",
  "origin_unhealthy",
  "queue_full",
  "admit_rate_changed",
  "schedule_open",
  "depth_cleared",
];

/** Events operators can subscribe to (excludes synthetic test). */
export const SUBSCRIBABLE_WEBHOOK_EVENTS: WebhookEvent[] = [...ALL_EVENTS];

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

function parseLastDelivery(raw: unknown): WebhookLastDelivery | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Partial<WebhookLastDelivery>;
  if (typeof o.at !== "number") return undefined;
  const event =
    typeof o.event === "string" && ([...ALL_EVENTS, "test"] as string[]).includes(o.event)
      ? (o.event as WebhookEvent)
      : "test";
  return {
    at: o.at,
    status: typeof o.status === "number" ? o.status : null,
    error: typeof o.error === "string" ? o.error : null,
    event,
  };
}

export async function readWebhookSettings(env: Env): Promise<WebhookSettings> {
  try {
    const raw = await env.CONFIG_KV.get(WEBHOOKS_KEY, "json");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_WEBHOOK_SETTINGS };
    const o = raw as Partial<WebhookSettings>;
    const settings: WebhookSettings = {
      enabled: o.enabled === true,
      url: typeof o.url === "string" ? sanitizeWebhookUrl(o.url) : null,
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
    if (Array.isArray(o.originUnhealthyQueues)) {
      settings.originUnhealthyQueues = o.originUnhealthyQueues.filter(
        (queue): queue is string => typeof queue === "string",
      );
    }
    if (typeof o.lastQueueFullFiredAt === "number") {
      settings.lastQueueFullFiredAt = o.lastQueueFullFiredAt;
    }
    if (o.waitingForScheduleOpen === true) {
      settings.waitingForScheduleOpen = true;
    }
    const lastDelivery = parseLastDelivery(o.lastDelivery);
    if (lastDelivery) settings.lastDelivery = lastDelivery;
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
  return sealWithAdminSecret(env, plain);
}

export async function openWebhookSecret(env: Env, sealed: string): Promise<string | null> {
  try {
    const opened = await openWithAdminSecretDetailed(env, sealed);
    if (opened.usedTokenSecretFallback) {
      const resealed = await sealWithAdminSecret(env, opened.plaintext);
      const settings = await readWebhookSettings(env);
      if (settings.sealedSecret === sealed) {
        await writeWebhookSettings(env, { ...settings, sealedSecret: resealed });
      }
    }
    return opened.plaintext;
  } catch {
    return null;
  }
}
