import type { AdmissionMode, QueueConfig } from "../core/types";

/** Default Durable Object alarm period for admit + expiry sweeps. */
export const QUEUE_ALARM_INTERVAL_MS = 1_000;

/** Floor for adaptive status poll interval (near front of line). */
export const ADAPTIVE_POLL_MIN_MS = 5_000;

/** Cap for adaptive status poll interval (far back), further limited by heartbeat timeout. */
export const ADAPTIVE_POLL_MAX_CAP_MS = 60_000;

/**
 * How many visitors to admit during a single alarm tick.
 * Fractional rates accumulate across ticks (0.5/s → admit 1 every 2s).
 */
export function admissionsForTick(
  admitPerSecond: number,
  intervalMs: number,
  remainder: number,
): { admitCount: number; nextRemainder: number } {
  if (admitPerSecond <= 0 || intervalMs <= 0) {
    return { admitCount: 0, nextRemainder: remainder };
  }

  const budget = remainder + admitPerSecond * (intervalMs / 1000);
  const admitCount = Math.floor(budget);
  return {
    admitCount,
    nextRemainder: budget - admitCount,
  };
}

/** 1-based FIFO position among waiting visitors ahead of / including this one. */
export function waitingPosition(waitingAhead: number): number {
  return waitingAhead + 1;
}

export function isHeartbeatExpired(
  lastHeartbeatAt: number,
  now: number,
  config: QueueConfig,
): boolean {
  return now - lastHeartbeatAt >= config.heartbeatTimeoutSeconds * 1000;
}

export function isQueueStayExpired(joinedAt: number, now: number, config: QueueConfig): boolean {
  return now - joinedAt >= config.queueTimeoutSeconds * 1000;
}

export function isAdmissionExpired(admittedAt: number, now: number, config: QueueConfig): boolean {
  return now - admittedAt >= config.tokenTTLSeconds * 1000;
}

export function openSlots(capacity: number, admittedCount: number): number {
  return Math.max(0, capacity - admittedCount);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Relative place in the current waiting set: 0 = front, 1 = back.
 * Queue mode uses FIFO position; lottery uses ETA vs queue stay timeout.
 */
export function queuePollProgress(input: {
  admissionMode: AdmissionMode;
  position: number | null;
  waiting: number;
  estimatedWaitSeconds: number;
  queueTimeoutSeconds: number;
}): number {
  if (input.admissionMode === "lottery") {
    const cap = Math.max(1, input.queueTimeoutSeconds);
    return clamp01(input.estimatedWaitSeconds / cap);
  }

  const waiting = Math.max(1, Math.floor(input.waiting));
  if (waiting <= 1) return 0;

  const position = Math.max(1, Math.floor(input.position ?? 1));
  return clamp01((position - 1) / (waiting - 1));
}

/**
 * Continuous adaptive poll interval from relative progress.
 * Stays under half of HEARTBEAT_TIMEOUT so status-only liveness is safe.
 */
export function nextPollAfterMs(progress: number, heartbeatTimeoutSeconds: number): number {
  const p = clamp01(progress);
  const timeoutBudgetMs = Math.max(0, Math.floor(heartbeatTimeoutSeconds * 1000 * 0.5));
  const maxMs = Math.min(ADAPTIVE_POLL_MAX_CAP_MS, timeoutBudgetMs);
  const minMs = Math.min(ADAPTIVE_POLL_MIN_MS, maxMs);
  return Math.round(minMs + (maxMs - minMs) * Math.sqrt(p));
}
