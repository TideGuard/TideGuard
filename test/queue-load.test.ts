import { describe, expect, it } from "vitest";
import {
  classifyQueueLoadRisk,
  estimateQueueLoad,
  QUEUE_CAPACITY_THRESHOLDS,
  queueLoadDisclaimer,
} from "../src/core/queue-load";

describe("estimateQueueLoad", () => {
  it("matches the default 0.1 RPS per waiting user background model", () => {
    const load = estimateQueueLoad({
      totalVisitors: 10_000,
      peakConcurrentWaiting: 5_000,
      statusPollIntervalSeconds: 15,
      heartbeatIntervalSeconds: 30,
      joinBurstDurationSeconds: 60,
      joinBurstVisitors: 0,
    });

    expect(load.backgroundRps).toBe(500);
    // Values >= 100 are rounded to whole RPS for display.
    expect(load.statusRps).toBe(333);
    expect(load.heartbeatRps).toBe(167);
    expect(load.riskLevel).toBe("elevated");
    expect(load.architecture).toBe("single_durable_object");
  });

  it("classifies high risk near 800+ peak RPS", () => {
    const load = estimateQueueLoad({
      totalVisitors: 20_000,
      peakConcurrentWaiting: 10_000,
      statusPollIntervalSeconds: 15,
      heartbeatIntervalSeconds: 30,
      joinBurstDurationSeconds: 60,
      joinBurstVisitors: 0,
    });
    expect(load.estimatedPeakRps).toBe(1000);
    expect(load.riskLevel).toBe("high");
    expect(load.recommendation).toContain("single Durable Object");
  });

  it("guards against zero intervals", () => {
    const load = estimateQueueLoad({
      totalVisitors: 100,
      peakConcurrentWaiting: 100,
      statusPollIntervalSeconds: 0,
      heartbeatIntervalSeconds: 0,
      joinBurstDurationSeconds: 0,
    });
    expect(load.statusRps).toBeGreaterThan(0);
    expect(load.heartbeatRps).toBeGreaterThan(0);
    expect(load.joinBurstRps).toBeGreaterThan(0);
  });

  it("exposes configurable thresholds and disclaimer", () => {
    expect(QUEUE_CAPACITY_THRESHOLDS.elevatedRps).toBe(500);
    expect(QUEUE_CAPACITY_THRESHOLDS.highRps).toBe(800);
    expect(classifyQueueLoadRisk(499)).toBe("low");
    expect(classifyQueueLoadRisk(500)).toBe("elevated");
    expect(classifyQueueLoadRisk(800)).toBe("high");
    expect(queueLoadDisclaimer()).toContain("planning aids");
  });
});
