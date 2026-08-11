import type { AdmissionMode, QueueConfig } from "../core/types";
import { DEFAULT_MISSED_SLOT_GRACE_SECONDS, clampMissedSlotGraceSeconds } from "../core/config";

/** Default Durable Object alarm period for admit + expiry sweeps. */
export const QUEUE_ALARM_INTERVAL_MS = 1_000;

/** Floor for adaptive status poll interval (near front of line). */
export const ADAPTIVE_POLL_MIN_MS = 5_000;

/** Cap for adaptive status poll interval (far back), further limited by heartbeat timeout. */
export const ADAPTIVE_POLL_MAX_CAP_MS = 60_000;

/**
 * Target Durable Object status check-ins per second (fixed; not operator-tunable).
 * Top of Cloudflare's moderate JSON/storage band, with headroom under the ~1k soft ceiling.
 */
export const STATUS_RPS_BUDGET = 750;

/** Never schedule status check-ins more often than this (seconds). */
export const MIN_CHECK_IN_PERIOD_SEC = 5;

/** Default cap on waiting rows in one QueueRoom (danger-zone editable). */
export const DEFAULT_MAX_WAITING_VISITORS = 1_000_000;

/** Allow status a few hundred ms early without counting as due for writes. */
export const CHECK_IN_EARLY_SKEW_MS = 500;

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
 * @deprecated Prefer timeslot `nextCheckAtMs`; kept for fixed-interval / compat clients.
 */
export function nextPollAfterMs(progress: number, heartbeatTimeoutSeconds: number): number {
  const p = clamp01(progress);
  const timeoutBudgetMs = Math.max(0, Math.floor(heartbeatTimeoutSeconds * 1000 * 0.5));
  const maxMs = Math.min(ADAPTIVE_POLL_MAX_CAP_MS, timeoutBudgetMs);
  const minMs = Math.min(ADAPTIVE_POLL_MIN_MS, maxMs);
  return Math.round(minMs + (maxMs - minMs) * Math.sqrt(p));
}

/** Steady-state check-in period for the full waiting set (seconds). */
export function checkInPeriodSeconds(
  waiting: number,
  budgetRps = STATUS_RPS_BUDGET,
  minPeriodSec = MIN_CHECK_IN_PERIOD_SEC,
): number {
  const w = Math.max(0, Math.floor(waiting));
  const budget = Math.max(1, Math.floor(budgetRps));
  const minPeriod = Math.max(1, Math.floor(minPeriodSec));
  if (w <= 0) return minPeriod;
  return Math.max(minPeriod, Math.ceil(w / budget));
}

/** How many FIFO positions keep the short (min) check-in period. */
export function frontBandSize(admitPerSecond: number): number {
  const rate = Number.isFinite(admitPerSecond) ? Math.max(0, admitPerSecond) : 0;
  return Math.max(500, Math.ceil(rate * 60));
}

/**
 * Effective period for one waiter: front band (and low lottery ETA) stay at min period.
 */
export function effectiveCheckInPeriodSeconds(input: {
  waiting: number;
  position: number | null;
  admissionMode: AdmissionMode;
  estimatedWaitSeconds: number;
  admitPerSecond: number;
}): number {
  const full = checkInPeriodSeconds(input.waiting);
  if (input.admissionMode === "lottery") {
    if (input.estimatedWaitSeconds <= 60) return MIN_CHECK_IN_PERIOD_SEC;
    return full;
  }
  const position = input.position ?? Number.POSITIVE_INFINITY;
  if (position <= frontBandSize(input.admitPerSecond)) {
    return MIN_CHECK_IN_PERIOD_SEC;
  }
  return full;
}

/** FNV-1a 32-bit hash for stable timeslot assignment. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function stableSlotIndex(visitorKey: string, periodSec: number): number {
  const period = Math.max(1, Math.floor(periodSec));
  if (period === 1) return 0;
  return hashString(visitorKey) % period;
}

/**
 * Next second-aligned check-in time for a visitor's slot within the period.
 * `minLeadMs` pushes the earliest acceptable instant (e.g. after a due renew).
 */
export function nextCheckAtMs(input: {
  now: number;
  periodSec: number;
  visitorKey: string;
  minLeadMs?: number;
}): number {
  const periodSec = Math.max(1, Math.floor(input.periodSec));
  const slot = stableSlotIndex(input.visitorKey, periodSec);
  const earliestSec = Math.ceil((input.now + Math.max(0, input.minLeadMs ?? 0)) / 1000);
  const mod = ((earliestSec % periodSec) + periodSec) % periodSec;
  const delta = (slot - mod + periodSec) % periodSec;
  return (earliestSec + delta) * 1000;
}

/**
 * Grace after `next_check_at` before a waiting visitor is expired for missing their slot.
 * At least the configured grace; never shorter than one full check-in period.
 */
export function missedSlotGraceMs(
  periodSec: number,
  graceSeconds: number = DEFAULT_MISSED_SLOT_GRACE_SECONDS,
): number {
  const baseMs = clampMissedSlotGraceSeconds(graceSeconds) * 1000;
  return Math.max(baseMs, Math.max(1, Math.floor(periodSec)) * 1000);
}

/** Whether a status request may renew liveness / advance the slot. */
export function isCheckInDue(
  now: number,
  nextCheckAt: number | null | undefined,
  skewMs = CHECK_IN_EARLY_SKEW_MS,
): boolean {
  if (nextCheckAt == null || !Number.isFinite(nextCheckAt)) return true;
  return now >= nextCheckAt - Math.max(0, skewMs);
}
