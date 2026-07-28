import { describe, expect, it } from "vitest";
import { estimateWaitingRoomCost, formatUsd } from "../src/core/cost-estimate";

describe("estimateWaitingRoomCost", () => {
  it("keeps short waits in the low hundreds for 5M visitors", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 2 * 60,
      includeBaseFee: true,
    });

    expect(estimate.statusPollsPerVisitor).toBe(48);
    expect(estimate.dominantCost).toBe("polling");
    expect(estimate.totalUsd).toBeGreaterThan(100);
    expect(estimate.totalUsd).toBeLessThan(250);
  });

  it("lands near ~$1k for 5M visitors with a 15 minute average wait", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 15 * 60,
    });

    expect(estimate.workerRequests).toBeGreaterThan(2_000_000_000);
    expect(estimate.totalUsd).toBeGreaterThan(900);
    expect(estimate.totalUsd).toBeLessThan(1500);
    expect(estimate.dominantCost).toBe("polling");
  });

  it("shows multi-thousand dollar ballpark for hour-long waits at 5M", () => {
    const estimate = estimateWaitingRoomCost({
      visitors: 5_000_000,
      averageWaitSeconds: 60 * 60,
    });

    expect(estimate.workerRequests).toBeGreaterThan(8_000_000_000);
    expect(estimate.totalUsd).toBeGreaterThan(3500);
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
