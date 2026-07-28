import type { QueueConfig } from "../core/types";

/** Default Durable Object alarm period for admit + expiry sweeps. */
export const QUEUE_ALARM_INTERVAL_MS = 1_000;

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
