/**
 * Isolated public live-demo sessions.
 *
 * Each session owns a dedicated Durable Object queue name so demos never share
 * state with operator queues. Controller actions require a signed demo token —
 * not the global admin session — and cannot touch other queues or secrets.
 */

import { ApiError } from "../core/errors";

export const DEMO_LIMITS = {
  /** Session lifetime (seconds). */
  sessionTtlSeconds: 45 * 60,
  /** Soft cap on joiners per demo queue. */
  maxParticipants: 25,
  /** Concurrent admitted capacity for demos. */
  maxConcurrentUsers: 5,
  minAdmitPerSecond: 0.1,
  maxAdmitPerSecond: 2,
  defaultAdmitPerSecond: 0.5,
  /** Max queue regenerations (reset) per session. */
  maxResets: 12,
  createPerIpPerMinute: 8,
  mutatePerIpPerMinute: 60,
  joinPerIpPerMinute: 30,
} as const;

export interface DemoSessionRecord {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  generation: number;
  admitPerSecond: number;
  paused: boolean;
  participantCount: number;
}

const SESSION_KEY_PREFIX = "demo:session:";

export function demoSessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}

export function demoQueueName(sessionId: string, generation: number): string {
  // Must satisfy parseQueueName (letters, numbers, _ -).
  return `demo-${sessionId}-g${generation}`;
}

export function isDemoQueueName(queue: string): boolean {
  return /^demo-[a-f0-9]{16,32}-g\d+$/i.test(queue);
}

export async function createDemoSessionId(): Promise<string> {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function writeDemoSession(env: Env, session: DemoSessionRecord): Promise<void> {
  const ttl = Math.max(60, Math.ceil((session.expiresAt - Date.now()) / 1000));
  await env.CONFIG_KV.put(demoSessionKey(session.sessionId), JSON.stringify(session), {
    expirationTtl: ttl,
  });
}

export async function readDemoSession(
  env: Env,
  sessionId: string,
): Promise<DemoSessionRecord | null> {
  if (!/^[a-f0-9]{16,32}$/i.test(sessionId)) {
    return null;
  }
  try {
    const raw = await env.CONFIG_KV.get(demoSessionKey(sessionId), "json");
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const session = raw as Partial<DemoSessionRecord>;
    if (
      typeof session.sessionId !== "string" ||
      typeof session.createdAt !== "number" ||
      typeof session.expiresAt !== "number" ||
      typeof session.generation !== "number" ||
      typeof session.admitPerSecond !== "number"
    ) {
      return null;
    }
    return {
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      generation: session.generation,
      admitPerSecond: session.admitPerSecond,
      paused: Boolean(session.paused),
      participantCount: typeof session.participantCount === "number" ? session.participantCount : 0,
    };
  } catch {
    return null;
  }
}

export function assertSessionActive(session: DemoSessionRecord, now = Date.now()): void {
  if (session.expiresAt <= now) {
    throw new ApiError("unauthorized", "Demo session has expired. Start a new demo.", 401, {
      reason: "demo_expired",
    });
  }
}

export function parseSessionIdParam(value: string | undefined): string {
  if (!value || !/^[a-f0-9]{16,32}$/i.test(value)) {
    throw new ApiError("bad_request", "Invalid demo session id", 400);
  }
  return value.toLowerCase();
}
