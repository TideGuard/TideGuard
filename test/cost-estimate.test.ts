import { describe, expect, it } from "vitest";
import { estimateWaitingRoomCost, formatUsd } from "../src/core/cost-estimate";

describe("estimateWaitingRoomCost", () => {
  it("keeps short waits inexpensive for 5M visitors at default poll intervals", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 2 * 60,
      includeBaseFee: true,
    });

    expect(estimate.statusPollsPerVisitor).toBe(8);
    expect(estimate.heartbeatsPerVisitor).toBe(4);
    expect(estimate.totalUsd).toBeGreaterThan(20);
    expect(estimate.totalUsd).toBeLessThan(80);
  });

  it("lands near a few hundred dollars for 5M visitors with a 15 minute average wait", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 15 * 60,
    });

    expect(estimate.workerRequests).toBe(465_000_000);
    expect(estimate.totalUsd).toBeGreaterThan(150);
    expect(estimate.totalUsd).toBeLessThan(350);
    expect(estimate.dominantCost).toBe("polling");
  });

  it("approaches ~$1k for hour-long waits at 5M with default intervals", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 60 * 60,
    });

    expect(estimate.workerRequests).toBe(1_815_000_000);
    expect(estimate.totalUsd).toBeGreaterThan(700);
    expect(estimate.totalUsd).toBeLessThan(1200);
    expect(formatUsd(estimate.totalUsd)).toMatch(/\$/);
  });

  it("is cheap when almost nobody waits", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 0,
    });

    // Mostly joins + pages; still some Worker/DO overage, but far below polling cases.
    expect(estimate.statusPollsPerVisitor).toBe(0);
    expect(estimate.totalUsd).toBeLessThan(50);
  });
});
