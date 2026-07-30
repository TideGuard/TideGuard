import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DEFAULT_QUEUE_CONFIG } from "../src/core/config";
import type { QueueConfig } from "../src/core/types";
import { TRAFFIC_BUCKET_MS, parseAdmitPerSecond } from "../src/queue/traffic";

function room(name: string) {
  return env.QUEUE_ROOM.getByName(name);
}

function config(overrides: Partial<QueueConfig> = {}): QueueConfig {
  return { ...DEFAULT_QUEUE_CONFIG, ...overrides };
}

describe("parseAdmitPerSecond", () => {
  it("accepts rates in range", () => {
    expect(parseAdmitPerSecond(2)).toBe(2);
    expect(parseAdmitPerSecond("0.5")).toBe(0.5);
    expect(parseAdmitPerSecond(1000)).toBe(1000);
  });

  it("rejects out of range", () => {
    expect(parseAdmitPerSecond(0)).toBeNull();
    expect(parseAdmitPerSecond(-1)).toBeNull();
    expect(parseAdmitPerSecond(1001)).toBeNull();
    expect(parseAdmitPerSecond("nope")).toBeNull();
  });
});

describe("runtime admit rate override", () => {
  it("overrides env admitPerSecond for metrics and effective rate", async () => {
    const stub = room("rate-override");
    const cfg = config({ maxConcurrentUsers: 10, admitPerSecond: 2 });
    const t0 = 20_000_000;

    await stub.setAdmitRate({ queue: "rate-override", config: cfg, admitPerSecond: 5 });
    const metrics = await stub.metrics({ queue: "rate-override", config: cfg, now: t0 });
    expect(metrics.admitPerSecond).toBe(5);
    expect(metrics.admitPerSecondOverride).toBe(5);
    expect(metrics.admitPerSecondDefault).toBe(2);
    expect(metrics.effectiveAdmitPerSecond).toBe(5);

    await stub.clearAdmitRate({ queue: "rate-override", config: cfg });
    const cleared = await stub.metrics({ queue: "rate-override", config: cfg, now: t0 + 1 });
    expect(cleared.admitPerSecond).toBe(2);
    expect(cleared.admitPerSecondOverride).toBeNull();
  });

  it("records joins as inflow and exposes traffic buckets", async () => {
    const stub = room("traffic-series");
    const cfg = config({ maxConcurrentUsers: 1, admitPerSecond: 1 });
    const t0 = align(30_000_000);

    await stub.join({
      queue: "traffic-series",
      config: cfg,
      visitorId: "a",
      now: t0,
    });
    await stub.join({
      queue: "traffic-series",
      config: cfg,
      visitorId: "b",
      now: t0 + 100,
    });

    const mid = await stub.metrics({ queue: "traffic-series", config: cfg, now: t0 + 200 });
    expect(mid.totalInflow).toBe(2);
    expect(mid.inflowCurrent).toBe(2);

    // Flush open bucket by advancing past the interval.
    const later = t0 + TRAFFIC_BUCKET_MS + 1;
    const traffic = await stub.getTraffic({
      queue: "traffic-series",
      config: cfg,
      now: later,
      rangeMs: 60 * 60 * 1000,
    });
    expect(traffic.totalInflow).toBe(2);
    expect(traffic.buckets.length).toBeGreaterThanOrEqual(1);
    const first = traffic.buckets[0]!;
    expect(first.joins).toBeGreaterThanOrEqual(2);
    expect(first.maxOutflow).toBe(1);
  });
});

function align(now: number): number {
  return Math.floor(now / TRAFFIC_BUCKET_MS) * TRAFFIC_BUCKET_MS;
}
