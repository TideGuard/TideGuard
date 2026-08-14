/**
 * Fire operator webhooks immediately, with Durable Object retry on failure.
 */

import {
  openWebhookSecret,
  readWebhookSettings,
  writeWebhookSettings,
  type WebhookEvent,
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

async function signBody(secret: string, body: string): Promise<string> {
  return hmacSign(secret, body);
}

export async function dispatchWebhook(
  env: Env,
  event: WebhookEvent,
  queue: string,
  detail: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    const settings = await readWebhookSettings(env);
    if (!settings.enabled || !settings.url || !settings.events.includes(event)) {
      return;
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
      if (secret) {
        headers["x-tideguard-signature"] = await signBody(secret, body);
      }
    }
    let delivered = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(settings.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      delivered = response.ok;
    } catch {
      delivered = false;
    } finally {
      clearTimeout(timer);
    }

    if (!delivered) {
      const room = getQueueRoom(env, queue);
      await room.enqueueWebhook({
        url: settings.url,
        headers,
        body,
        event,
        queue,
      });
    }
  } catch {
    /* Delivery must never fail the operator or visitor request. */
  }
}

/** Fire depth once when waiting crosses threshold; debounce until waiting drops below. */
export async function maybeDispatchDepthWebhook(
  env: Env,
  queue: string,
  waiting: number,
): Promise<void> {
  try {
    const settings = await readWebhookSettings(env);
    if (!settings.enabled || !settings.url || !settings.events.includes("depth")) {
      return;
    }
    const threshold = settings.depthThreshold;
    if (waiting < threshold) {
      if (settings.lastDepthFiredAt) {
        const next: WebhookSettings = { ...settings };
        delete next.lastDepthFiredAt;
        await writeWebhookSettings(env, next);
      }
      return;
    }
    if (settings.lastDepthFiredAt) {
      return;
    }
    await writeWebhookSettings(env, {
      ...settings,
      lastDepthFiredAt: Date.now(),
    });
    await dispatchWebhook(env, "depth", queue, {
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
