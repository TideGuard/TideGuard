import { describe, expect, it } from "vitest";
import {
  QUEUE_ALARM_INTERVAL_MS,
  admissionsForTick,
  isAdmissionExpired,
  isHeartbeatExpired,
  isQueueStayExpired,
  nextPollAfterMs,
  openSlots,
  queuePollProgress,
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

    expect(isQueueStayExpired(now - 1_799_000, now, config)).toBe(false);
    expect(isQueueStayExpired(now - 1_800_000, now, config)).toBe(true);

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
