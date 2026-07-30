import { describe, expect, it } from "vitest";
import {
  adaptiveAveragePollSeconds,
  estimateWaitingRoomCost,
  formatUsd,
} from "../src/core/cost-estimate";

describe("estimateWaitingRoomCost", () => {
  it("defaults to adaptive polling with no dedicated heartbeats", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 15 * 60,
    });

    expect(estimate.pollingMode).toBe("adaptive");
    expect(estimate.heartbeatsPerVisitor).toBe(0);
    expect(estimate.pollIntervalSeconds).toBeCloseTo(adaptiveAveragePollSeconds(), 5);
    expect(estimate.statusPollsPerVisitor).toBe(Math.ceil(900 / adaptiveAveragePollSeconds()));
    expect(estimate.totalUsd).toBeGreaterThan(20);
    expect(estimate.totalUsd).toBeLessThan(200);
  });

  it("keeps short waits inexpensive for 5M visitors under adaptive defaults", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 2 * 60,
      includeBaseFee: true,
    });

    expect(estimate.statusPollsPerVisitor).toBe(Math.ceil(120 / adaptiveAveragePollSeconds()));
    expect(estimate.heartbeatsPerVisitor).toBe(0);
    expect(estimate.totalUsd).toBeGreaterThan(5);
    expect(estimate.totalUsd).toBeLessThan(50);
  });

  it("models fixed intervals when explicitly requested", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 15 * 60,
      pollingMode: "fixed",
      pollIntervalSeconds: 15,
      heartbeatIntervalSeconds: 30,
    });

    expect(estimate.pollingMode).toBe("fixed");
    expect(estimate.statusPollsPerVisitor).toBe(60);
    expect(estimate.heartbeatsPerVisitor).toBe(30);
    expect(estimate.workerRequests).toBe(465_000_000);
    expect(estimate.totalUsd).toBeGreaterThan(150);
    expect(estimate.totalUsd).toBeLessThan(350);
    expect(estimate.dominantCost).toBe("polling");
  });

  it("is cheaper in adaptive than fixed for the same long wait", () => {
    const adaptive = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 60 * 60,
      pollingMode: "adaptive",
    });
    const fixed = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 60 * 60,
      pollingMode: "fixed",
    });

    expect(adaptive.totalUsd).toBeLessThan(fixed.totalUsd);
    expect(formatUsd(adaptive.totalUsd)).toMatch(/\$/);
  });

  it("is cheap when almost nobody waits", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 0,
    });

    expect(estimate.statusPollsPerVisitor).toBe(0);
    expect(estimate.totalUsd).toBeLessThan(50);
  });
});
