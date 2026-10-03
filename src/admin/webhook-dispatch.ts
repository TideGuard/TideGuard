/**
 * Fire operator webhooks immediately, with Durable Object retry on failure.
 */

import {
  openWebhookSecret,
  readWebhookSettings,
  sanitizeWebhookUrl,
  writeWebhookSettings,
  type WebhookEvent,
  type WebhookLastDelivery,
  type WebhookSettings,
} from "./webhook-store";
import { hmacSign } from "../auth/crypto";
import { getQueueRoom } from "../queue/client";

export interface WebhookPayload {
  event: WebhookEvent;
  queue: string;
  at: number;
  detail: Record<string, string | number | boolean | null>;
}

/** In-isolate debounce so join spam does not KV-thrash before the latch is written. */
const queueFullMemoryLatch = new Map<string, number>();
const QUEUE_FULL_DEBOUNCE_MS = 60_000;

async function signBody(secret: string, body: string): Promise<string> {
  return hmacSign(secret, body);
}

async function recordDelivery(
  env: Env,
  settings: WebhookSettings,
  delivery: WebhookLastDelivery,
): Promise<void> {
  await writeWebhookSettings(env, { ...settings, lastDelivery: delivery });
}

/**
 * POST to the configured URL and persist lastDelivery.
 * When requireEnabled is false (test ping), skips the enabled/events gates.
 * On failed delivery, enqueues a Durable Object retry (when a URL was attempted).
 */
export async function deliverWebhook(
  env: Env,
  event: WebhookEvent,
  queue: string,
  detail: Record<string, string | number | boolean | null>,
  options: { requireEnabled?: boolean } = {},
): Promise<WebhookLastDelivery> {
  const requireEnabled = options.requireEnabled !== false;
  const settings = await readWebhookSettings(env);
  const safeUrl = sanitizeWebhookUrl(settings.url);
  if (!safeUrl) {
    const delivery: WebhookLastDelivery = {
      at: Date.now(),
      status: null,
      error: settings.url
        ? "Webhook URL is not a public https endpoint"
        : "No webhook URL configured",
      event,
    };
    await recordDelivery(env, settings, delivery);
    return delivery;
  }
  if (requireEnabled) {
    if (!settings.enabled || !settings.events.includes(event)) {
      return (
        settings.lastDelivery ?? {
          at: Date.now(),
          status: null,
          error: "skipped",
          event,
        }
      );
    }
  }

  const payload: WebhookPayload = {
    event,
    queue,
    at: Date.now(),
    detail,
  };
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "TideGuard-Webhook/0.5",
  };
  if (settings.sealedSecret) {
    const secret = await openWebhookSecret(env, settings.sealedSecret);
    if (!secret) {
      const delivery: WebhookLastDelivery = {
        at: Date.now(),
        status: null,
        error: "Signing secret could not be decrypted; re-save it under System → Webhooks",
        event,
      };
      const latest = await readWebhookSettings(env);
      await recordDelivery(env, latest, delivery);
      return delivery;
    }
    headers["x-tideguard-signature"] = await signBody(secret, body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  let delivery: WebhookLastDelivery;
  try {
    const res = await fetch(safeUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    delivery = {
      at: Date.now(),
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
      event,
    };
    if (!res.ok) {
      const room = getQueueRoom(env, queue);
      await room.enqueueWebhook({
        url: safeUrl,
        headers,
        body,
        event,
        queue,
      });
    }
  } catch (err) {
    delivery = {
      at: Date.now(),
      status: null,
      error: err instanceof Error ? err.message : "delivery failed",
      event,
    };
    try {
      const room = getQueueRoom(env, queue);
      await room.enqueueWebhook({
        url: safeUrl,
        headers,
        body,
        event,
        queue,
      });
    } catch {
      /* enqueue is best-effort */
    }
  } finally {
    clearTimeout(timer);
  }
  // Re-read so concurrent depth/schedule flags are not clobbered.
  const latest = await readWebhookSettings(env);
  await recordDelivery(env, latest, delivery);
  return delivery;
}

export async function dispatchWebhook(
  env: Env,
  event: WebhookEvent,
  queue: string,
  detail: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    await deliverWebhook(env, event, queue, detail, { requireEnabled: true });
  } catch {
    /* Delivery must never fail the operator or visitor request. */
  }
}

/** Fire depth once when waiting crosses threshold; depth_cleared when it drops below. */
export async function maybeDispatchDepthWebhook(
  env: Env,
  queue: string,
  waiting: number,
): Promise<void> {
  try {
    const settings = await readWebhookSettings(env);
    if (!settings.enabled || !settings.url) return;

    const threshold = settings.depthThreshold;
    if (waiting < threshold) {
      if (settings.lastDepthFiredAt) {
        const next: WebhookSettings = { ...settings };
        delete next.lastDepthFiredAt;
        await writeWebhookSettings(env, next);
        if (settings.events.includes("depth_cleared")) {
          await deliverWebhook(env, "depth_cleared", queue, { waiting, threshold });
        }
      }
      return;
    }
    if (!settings.events.includes("depth")) return;
    if (settings.lastDepthFiredAt) return;
    await writeWebhookSettings(env, {
      ...settings,
      lastDepthFiredAt: Date.now(),
    });
    await deliverWebhook(env, "depth", queue, {
      waiting,
      threshold,
    });
  } catch {
    /* best-effort */
  }
}

/** Fire once when a queue transitions into origin-health auto-pause. */
export async function maybeDispatchOriginUnhealthyWebhook(
  env: Env,
  queue: string,
  autoPaused: boolean,
  detail: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    const settings = await readWebhookSettings(env);
    const active = new Set(settings.originUnhealthyQueues ?? []);
    if (!autoPaused) {
      if (active.delete(queue)) {
        await writeWebhookSettings(env, {
          ...settings,
          originUnhealthyQueues: [...active],
        });
      }
      return;
    }
    if (active.has(queue)) {
      return;
    }
    active.add(queue);
    await writeWebhookSettings(env, {
      ...settings,
      originUnhealthyQueues: [...active],
    });
    await dispatchWebhook(env, "origin_unhealthy", queue, detail);
  } catch {
    /* best-effort transition observation */
  }
}

/**
 * Fire schedule_open only when transitioning from waiting-for-opensAt to open.
 */
export async function maybeDispatchScheduleOpenWebhook(
  env: Env,
  queue: string,
  opensAt: number | null,
): Promise<void> {
  try {
    const settings = await readWebhookSettings(env);
    if (!settings.enabled || !settings.url) return;

    const now = Date.now();
    const waitingForOpen = opensAt !== null && now < opensAt;
    if (waitingForOpen) {
      if (!settings.waitingForScheduleOpen) {
        await writeWebhookSettings(env, { ...settings, waitingForScheduleOpen: true });
      }
      return;
    }
    if (!settings.waitingForScheduleOpen) return;
    const next: WebhookSettings = { ...settings };
    delete next.waitingForScheduleOpen;
    await writeWebhookSettings(env, next);
    if (settings.events.includes("schedule_open")) {
      await deliverWebhook(env, "schedule_open", queue, {
        opensAt,
        openedAt: now,
      });
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Fire queue_full at most once per debounce window (memory + KV latch).
 * Avoids webhook amplification from public join spam while the room is at capacity.
 */
export async function maybeDispatchQueueFullWebhook(env: Env, queue: string): Promise<void> {
  try {
    const now = Date.now();
    const memAt = queueFullMemoryLatch.get(queue) ?? 0;
    if (now - memAt < QUEUE_FULL_DEBOUNCE_MS) return;

    const settings = await readWebhookSettings(env);
    if (!settings.enabled || !settings.url || !settings.events.includes("queue_full")) return;
    if (
      settings.lastQueueFullFiredAt &&
      now - settings.lastQueueFullFiredAt < QUEUE_FULL_DEBOUNCE_MS
    ) {
      queueFullMemoryLatch.set(queue, settings.lastQueueFullFiredAt);
      return;
    }

    queueFullMemoryLatch.set(queue, now);
    await writeWebhookSettings(env, { ...settings, lastQueueFullFiredAt: now });
    await deliverWebhook(env, "queue_full", queue, { at: now });
  } catch {
    /* best-effort */
  }
}
