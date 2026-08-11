import { describe, expect, it } from "vitest";
import {
  QUEUE_ALARM_INTERVAL_MS,
  STATUS_RPS_BUDGET,
  MIN_CHECK_IN_PERIOD_SEC,
  admissionsForTick,
  checkInPeriodSeconds,
  effectiveCheckInPeriodSeconds,
  isAdmissionExpired,
  isCheckInDue,
  isHeartbeatExpired,
  isQueueStayExpired,
  missedSlotGraceMs,
  nextCheckAtMs,
  nextPollAfterMs,
  openSlots,
  queuePollProgress,
  stableSlotIndex,
  waitingPosition,
} from "../src/queue/engine";
import { DEFAULT_QUEUE_CONFIG } from "../src/core/config";

describe("admissionsForTick", () => {
  it("admits at the configured rate for a one-second tick", () => {
    expect(admissionsForTick(2, QUEUE_ALARM_INTERVAL_MS, 0)).toEqual({
      admitCount: 2,
      nextRemainder: 0,
    });
  });

  it("accumulates fractional admission rates", () => {
    const first = admissionsForTick(0.5, QUEUE_ALARM_INTERVAL_MS, 0);
    expect(first).toEqual({ admitCount: 0, nextRemainder: 0.5 });

    const second = admissionsForTick(0.5, QUEUE_ALARM_INTERVAL_MS, first.nextRemainder);
    expect(second).toEqual({ admitCount: 1, nextRemainder: 0 });
  });
});

describe("queue helpers", () => {
  it("computes 1-based waiting positions", () => {
    expect(waitingPosition(0)).toBe(1);
    expect(waitingPosition(4)).toBe(5);
  });

  it("computes open capacity slots", () => {
    expect(openSlots(20, 18)).toBe(2);
    expect(openSlots(20, 20)).toBe(0);
    expect(openSlots(20, 25)).toBe(0);
  });

  it("detects heartbeat, queue-stay, and admission expiry", () => {
    const now = 1_000_000;
    const config = DEFAULT_QUEUE_CONFIG;

    expect(isHeartbeatExpired(now - 179_000, now, config)).toBe(false);
    expect(isHeartbeatExpired(now - 180_000, now, config)).toBe(true);

    expect(isQueueStayExpired(now - 86_399_000, now, config)).toBe(false);
    expect(isQueueStayExpired(now - 86_400_000, now, config)).toBe(true);

    expect(isAdmissionExpired(now - 599_000, now, config)).toBe(false);
    expect(isAdmissionExpired(now - 600_000, now, config)).toBe(true);
  });
});

describe("adaptive poll interval", () => {
  it("maps relative progress continuously for any queue size", () => {
    expect(
      queuePollProgress({
        admissionMode: "queue",
        position: 2,
        waiting: 60,
        estimatedWaitSeconds: 0,
        queueTimeoutSeconds: 1800,
      }),
    ).toBeCloseTo(1 / 59, 5);

    expect(
      queuePollProgress({
        admissionMode: "queue",
        position: 50,
        waiting: 60,
        estimatedWaitSeconds: 0,
        queueTimeoutSeconds: 1800,
      }),
    ).toBeCloseTo(49 / 59, 5);

    expect(
      queuePollProgress({
        admissionMode: "queue",
        position: 50,
        waiting: 10_000,
        estimatedWaitSeconds: 0,
        queueTimeoutSeconds: 1800,
      }),
    ).toBeCloseTo(49 / 9_999, 5);
  });

  it("returns front-of-line min and back-of-line max under default timeout", () => {
    const timeout = 180;
    expect(nextPollAfterMs(0, timeout)).toBe(5_000);
    expect(nextPollAfterMs(1, timeout)).toBe(60_000);

    const midSmall = nextPollAfterMs(49 / 59, timeout);
    const midLarge = nextPollAfterMs(49 / 9_999, timeout);
    expect(midLarge).toBeLessThan(midSmall);
    expect(midLarge).toBeGreaterThan(5_000);
    expect(midSmall).toBeLessThan(60_000);
  });

  it("uses ETA progress for lottery mode", () => {
    expect(
      queuePollProgress({
        admissionMode: "lottery",
        position: null,
        waiting: 100,
        estimatedWaitSeconds: 900,
        queueTimeoutSeconds: 1800,
      }),
    ).toBeCloseTo(0.5, 5);
  });
});

describe("timeslot check-in", () => {
  it("floors period at 5s and caps density near the RPS budget", () => {
    expect(checkInPeriodSeconds(200)).toBe(MIN_CHECK_IN_PERIOD_SEC);
    expect(checkInPeriodSeconds(750)).toBe(MIN_CHECK_IN_PERIOD_SEC);
    expect(checkInPeriodSeconds(3_750)).toBe(MIN_CHECK_IN_PERIOD_SEC);
    expect(checkInPeriodSeconds(7_500)).toBe(10);
    expect(checkInPeriodSeconds(45_000)).toBe(60);
    expect(7_500 / checkInPeriodSeconds(7_500)).toBeCloseTo(STATUS_RPS_BUDGET, 5);
  });

  it("keeps the front band on the min period", () => {
    expect(
      effectiveCheckInPeriodSeconds({
        waiting: 45_000,
        position: 1,
        admissionMode: "queue",
        estimatedWaitSeconds: 22_500,
        admitPerSecond: 2,
      }),
    ).toBe(MIN_CHECK_IN_PERIOD_SEC);

    expect(
      effectiveCheckInPeriodSeconds({
        waiting: 45_000,
        position: 20_000,
        admissionMode: "queue",
        estimatedWaitSeconds: 10_000,
        admitPerSecond: 2,
      }),
    ).toBe(60);
  });

  it("assigns a stable second-aligned nextCheckAt", () => {
    const now = 1_700_000_000_123;
    const periodSec = 10;
    const key = "visitor-a";
    const slot = stableSlotIndex(key, periodSec);
    const at = nextCheckAtMs({ now, periodSec, visitorKey: key });
    expect(at % 1000).toBe(0);
    expect(Math.floor(at / 1000) % periodSec).toBe(slot);
    expect(at).toBeGreaterThanOrEqual(Math.ceil(now / 1000) * 1000);
    expect(nextCheckAtMs({ now, periodSec, visitorKey: key })).toBe(at);
  });

  it("treats early status as not due and sizes missed-slot grace", () => {
    const next = 1_000_000;
    expect(isCheckInDue(next - 1_000, next)).toBe(false);
    expect(isCheckInDue(next - 100, next)).toBe(true);
    expect(isCheckInDue(next + 1, next)).toBe(true);
    expect(missedSlotGraceMs(5)).toBe(120_000);
    expect(missedSlotGraceMs(180)).toBe(180_000);
    expect(missedSlotGraceMs(5, 60)).toBe(60_000);
    expect(missedSlotGraceMs(5, 10)).toBe(30_000); // clamped to min 30
    expect(missedSlotGraceMs(5, 999)).toBe(900_000); // clamped to max 900
  });
});
