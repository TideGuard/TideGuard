/**
 * Append-only admin activity log in KV (ring buffer).
 */

import { AUDIT_LOG_KEY, AUDIT_LOG_MAX_EVENTS, type AuditEvent } from "./types";

export async function appendAuditEvent(
  env: Env,
  event: Omit<AuditEvent, "id" | "at"> & { at?: number; id?: string },
): Promise<AuditEvent> {
  const full: AuditEvent = {
    id: event.id ?? randomId(),
    at: event.at ?? Date.now(),
    actorId: event.actorId,
    actorUsername: event.actorUsername,
    action: event.action,
    summary: event.summary,
  };
  if (event.meta) {
    full.meta = event.meta;
  }

  const existing = await readAuditEvents(env);
  const next = [full, ...existing].slice(0, AUDIT_LOG_MAX_EVENTS);
  await env.CONFIG_KV.put(AUDIT_LOG_KEY, JSON.stringify({ events: next }));
  return full;
}

export async function readAuditEvents(env: Env): Promise<AuditEvent[]> {
  try {
    const raw = await env.CONFIG_KV.get(AUDIT_LOG_KEY, "json");
    if (!raw || typeof raw !== "object") return [];
    const events = (raw as { events?: unknown }).events;
    if (!Array.isArray(events)) return [];
    const out: AuditEvent[] = [];
    for (const item of events) {
      if (!item || typeof item !== "object") continue;
      const e = item as Partial<AuditEvent>;
      if (
        typeof e.id !== "string" ||
        typeof e.at !== "number" ||
        typeof e.actorId !== "string" ||
        typeof e.actorUsername !== "string" ||
        typeof e.action !== "string" ||
        typeof e.summary !== "string"
      ) {
        continue;
      }
      const event: AuditEvent = {
        id: e.id,
        at: e.at,
        actorId: e.actorId,
        actorUsername: e.actorUsername,
        action: e.action,
        summary: e.summary,
      };
      if (e.meta && typeof e.meta === "object") {
        event.meta = e.meta;
      }
      out.push(event);
    }
    return out;
  } catch {
    return [];
  }
}

export async function clearAuditLog(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(AUDIT_LOG_KEY);
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
