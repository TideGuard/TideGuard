/**
 * Fire operator webhooks (best-effort, never throws to callers).
 */

import {
  openWebhookSecret,
  readWebhookSettings,
  writeWebhookSettings,
  type WebhookEvent,
  type WebhookSettings,
} from "./webhook-store";
import { hmacSign } from "../auth/crypto";

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
      "user-agent": "TideGuard-Webhook/0.3",
    };
    if (settings.sealedSecret) {
      const secret = await openWebhookSecret(env, settings.sealedSecret);
      if (secret) {
        headers["x-tideguard-signature"] = await signBody(secret, body);
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      await fetch(settings.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* best-effort */
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
