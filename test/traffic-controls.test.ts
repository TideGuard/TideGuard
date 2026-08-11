import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DEFAULT_QUEUE_CONFIG } from "../src/core/config";
import type { QueueConfig } from "../src/core/types";

function room(name: string) {
  return env.QUEUE_ROOM.getByName(name);
}

function config(overrides: Partial<QueueConfig> = {}): QueueConfig {
  return { ...DEFAULT_QUEUE_CONFIG, ...overrides };
}

describe("opening schedule and silent pause", () => {
  it("keeps visitors waiting before opensAt even with free capacity", async () => {
    const stub = room("opens-later");
    const cfg = config({ maxConcurrentUsers: 10 });
    const t0 = 5_000_000;
    await stub.setOpensAt(t0 + 60_000);

    const joined = await stub.join({
      queue: "opens-later",
      config: cfg,
      visitorId: "early",
      now: t0,
    });
    expect(joined.status).toBe("waiting");

    const after = await stub.join({
      queue: "opens-later",
      config: cfg,
      visitorId: "late",
      now: t0 + 60_000,
    });
    expect(after.status).toBe("admitted");
  });

  it("defers nextCheckAt until opensAt for early joiners", async () => {
    const stub = room("opens-checkin");
    const cfg = config({ maxConcurrentUsers: 10 });
    const t0 = 7_000_000;
    const opensAt = t0 + 3_600_000;
    await stub.setOpensAt(opensAt);

    const early = await stub.join({
      queue: "opens-checkin",
      config: cfg,
      visitorId: "early-waiter",
      now: t0 + 1_000,
    });
    expect(early.status).toBe("waiting");
    expect(early.admissionOpen).toBe(false);
    expect(early.opensAt).toBe(opensAt);
    expect(early.nextCheckAt).toBeGreaterThanOrEqual(opensAt);

    // Status before open stays non-renewing and keeps a post-open slot.
    const status = await stub.status({
      queue: "opens-checkin",
      config: cfg,
      visitorId: "early-waiter",
      now: t0 + 30_000,
    });
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.visitor.lastHeartbeatAt).toBe(t0 + 1_000);
      expect(status.visitor.nextCheckAt).toBeGreaterThanOrEqual(opensAt);
      expect(status.visitor.admissionOpen).toBe(false);
      expect(status.visitor.opensAt).toBe(opensAt);
    }

    const afterOpen = await stub.status({
      queue: "opens-checkin",
      config: cfg,
      visitorId: "early-waiter",
      now: opensAt,
    });
    expect(afterOpen.ok).toBe(true);
    if (afterOpen.ok) {
      expect(afterOpen.visitor.admissionOpen).toBe(true);
      expect(afterOpen.visitor.opensAt).toBeNull();
    }
  });

  it("repairs a pre-open nextCheckAt when schedule is set after join", async () => {
    const stub = room("opens-repair");
    const cfg = config({ maxConcurrentUsers: 1 });
    const t0 = 9_000_000;

    await stub.join({
      queue: "opens-repair",
      config: cfg,
      visitorId: "seat",
      now: t0,
    });
    const waiter = await stub.join({
      queue: "opens-repair",
      config: cfg,
      visitorId: "repair-me",
      now: t0,
    });
    expect(waiter.nextCheckAt).toBeGreaterThan(t0);
    expect(waiter.nextCheckAt).toBeLessThan(t0 + 60_000);

    const opensAt = t0 + 2_000_000;
    await stub.setOpensAt(opensAt);

    const repaired = await stub.status({
      queue: "opens-repair",
      config: cfg,
      visitorId: "repair-me",
      now: t0 + 5_000,
    });
    expect(repaired.ok).toBe(true);
    if (repaired.ok) {
      expect(repaired.visitor.nextCheckAt).toBeGreaterThanOrEqual(opensAt);
      // Repair is not a due renew — heartbeat timestamp stays at join.
      expect(repaired.visitor.lastHeartbeatAt).toBe(t0);
    }

    // Heartbeat repair path after joining while open, then scheduling a future opensAt.
    await stub.setOpensAt(null);
    const lateJoin = await stub.join({
      queue: "opens-repair",
      config: cfg,
      visitorId: "repair-hb-2",
      now: t0 + 7_000,
    });
    expect(lateJoin.nextCheckAt).toBeLessThan(opensAt);
    await stub.setOpensAt(opensAt);
    const hb = await stub.heartbeat({
      queue: "opens-repair",
      config: cfg,
      visitorId: "repair-hb-2",
      now: t0 + 8_000,
    });
    expect(hb.ok).toBe(true);
    if (hb.ok) {
      expect(hb.visitor.nextCheckAt).toBeGreaterThanOrEqual(opensAt);
      expect(hb.visitor.lastHeartbeatAt).toBe(t0 + 7_000);
    }
  });

  it("silently blocks admits while paused", async () => {
    const stub = room("silent-pause");
    const cfg = config({ maxConcurrentUsers: 10 });
    await stub.setPaused(true);
    const joined = await stub.join({
      queue: "silent-pause",
      config: cfg,
      visitorId: "p1",
      now: 6_000_000,
    });
    expect(joined.status).toBe("waiting");
    // Public view must not carry ops flags (paused is admin/metrics only).
    expect((joined as { paused?: boolean }).paused).toBeUndefined();

    await stub.setPaused(false);
    const again = await stub.join({
      queue: "silent-pause",
      config: cfg,
      visitorId: "p2",
      now: 6_000_100,
    });
    expect(again.status).toBe("admitted");
  });

  it("rejects private health probe URLs and supports override", async () => {
    const stub = room("health-ssrf");
    const cfg = config();
    const blocked = await stub.setHealthConfig({
      queue: "health-ssrf",
      config: cfg,
      health: { enabled: true, url: "http://127.0.0.1/health" },
    });
    expect(blocked.config.enabled).toBe(false);
    expect(blocked.config.url).toBeNull();

    const ok = await stub.setHealthConfig({
      queue: "health-ssrf",
      config: cfg,
      health: { enabled: true, url: "https://origin.example.com/health" },
    });
    expect(ok.config.enabled).toBe(true);
    expect(ok.config.url).toBe("https://origin.example.com/health");

    const overridden = await stub.overrideHealth(15);
    expect(overridden.config.overrideUntil).toBeTypeOf("number");
    expect(overridden.config.overrideUntil!).toBeGreaterThan(Date.now());
  });
});
