import { describe, expect, it } from "vitest";
import {
  QUEUE_ALARM_INTERVAL_MS,
  admissionsForTick,
  isAdmissionExpired,
  isHeartbeatExpired,
  isQueueStayExpired,
  openSlots,
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

    expect(isHeartbeatExpired(now - 59_000, now, config)).toBe(false);
    expect(isHeartbeatExpired(now - 60_000, now, config)).toBe(true);

    expect(isQueueStayExpired(now - 1_799_000, now, config)).toBe(false);
    expect(isQueueStayExpired(now - 1_800_000, now, config)).toBe(true);

    expect(isAdmissionExpired(now - 599_000, now, config)).toBe(false);
    expect(isAdmissionExpired(now - 600_000, now, config)).toBe(true);
  });
});
