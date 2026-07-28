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

describe("click-to-enter admit hold", () => {
  it("withholds entry until confirm, then marks entered", async () => {
    const stub = room("click-enter");
    const cfg = config({
      maxConcurrentUsers: 1,
      requireClickToEnter: true,
      admitHoldSeconds: 30,
    });

    await stub.setAdmitUx({
      queue: "click-enter",
      config: cfg,
      requireClickToEnter: true,
      admitHoldSeconds: 30,
    });

    const t0 = 2_000_000;
    const joined = await stub.join({
      queue: "click-enter",
      config: cfg,
      visitorId: "clicker",
      now: t0,
    });
    expect(joined.status).toBe("admitted");
    expect(joined.entered).toBe(false);
    expect(joined.holdSecondsRemaining).toBe(30);

    const entered = await stub.enter({
      queue: "click-enter",
      config: cfg,
      visitorId: "clicker",
      now: t0 + 2_000,
    });
    expect(entered.ok).toBe(true);
    if (entered.ok) {
      expect(entered.visitor.entered).toBe(true);
      expect(entered.visitor.holdSecondsRemaining).toBeNull();
    }
  });

  it("expires unconfirmed admits after the hold window", async () => {
    const stub = room("click-expire");
    const cfg = config({
      maxConcurrentUsers: 1,
      requireClickToEnter: true,
      admitHoldSeconds: 10,
    });

    await stub.setAdmitUx({
      queue: "click-expire",
      config: cfg,
      requireClickToEnter: true,
      admitHoldSeconds: 10,
    });

    const t0 = 3_000_000;
    await stub.join({
      queue: "click-expire",
      config: cfg,
      visitorId: "slow",
      now: t0,
    });

    const expired = await stub.status({
      queue: "click-expire",
      config: cfg,
      visitorId: "slow",
      now: t0 + 10_000,
    });
    expect(expired).toEqual({ ok: false, code: "not_found" });
  });
});
