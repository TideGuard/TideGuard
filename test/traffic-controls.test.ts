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
