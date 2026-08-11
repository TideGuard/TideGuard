import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DEFAULT_QUEUE_CONFIG } from "../src/core/config";

function room(name: string) {
  return env.QUEUE_ROOM.getByName(name);
}

function config(overrides: Partial<typeof DEFAULT_QUEUE_CONFIG> = {}) {
  return { ...DEFAULT_QUEUE_CONFIG, ...overrides };
}

describe("QueueRoom FIFO behavior", () => {
  it("admits immediately when capacity is available", async () => {
    const stub = room("admit-immediate");
    const result = await stub.join({
      queue: "admit-immediate",
      config: config({ maxConcurrentUsers: 2 }),
    });

    expect(result.status).toBe("admitted");
    expect(result.position).toBeNull();
    expect(result.admittedAt).not.toBeNull();
  });

  it("queues visitors in FIFO order and reports positions", async () => {
    const stub = room("fifo-order");
    const cfg = config({ maxConcurrentUsers: 1, admitPerSecond: 1 });

    const first = await stub.join({ queue: "fifo-order", config: cfg, visitorId: "a" });
    const second = await stub.join({ queue: "fifo-order", config: cfg, visitorId: "b" });
    const third = await stub.join({ queue: "fifo-order", config: cfg, visitorId: "c" });

    expect(first.status).toBe("admitted");
    expect(second.status).toBe("waiting");
    expect(second.position).toBe(1);
    expect(second.ahead).toBe(0);
    expect(third.status).toBe("waiting");
    expect(third.position).toBe(2);
    expect(third.ahead).toBe(1);
    expect(third.behind).toBe(0);

    const secondLater = await stub.status({
      queue: "fifo-order",
      config: cfg,
      visitorId: "b",
    });
    expect(secondLater.ok).toBe(true);
    if (secondLater.ok) {
      expect(secondLater.visitor.behind).toBe(1);
    }
  });

  it("is idempotent when the same visitor joins twice", async () => {
    const stub = room("join-idempotent");
    const cfg = config({ maxConcurrentUsers: 1 });

    const first = await stub.join({
      queue: "join-idempotent",
      config: cfg,
      visitorId: "same",
    });
    const second = await stub.join({
      queue: "join-idempotent",
      config: cfg,
      visitorId: "same",
    });

    expect(first.id).toBe("same");
    expect(second.id).toBe("same");
    expect(second.status).toBe(first.status);
  });

  it("admits the next waiter when a slot is freed", async () => {
    const stub = room("leave-promotes");
    const cfg = config({ maxConcurrentUsers: 1, admitPerSecond: 100 });

    await stub.join({ queue: "leave-promotes", config: cfg, visitorId: "held" });
    await stub.join({ queue: "leave-promotes", config: cfg, visitorId: "next" });

    const leave = await stub.leave({
      queue: "leave-promotes",
      config: cfg,
      visitorId: "held",
    });
    expect(leave.status).toBe("left");

    const promoted = await stub.status({
      queue: "leave-promotes",
      config: cfg,
      visitorId: "next",
    });
    expect(promoted.ok).toBe(true);
    if (promoted.ok) {
      expect(promoted.visitor.status).toBe("admitted");
    }
  });

  it("expires waiting visitors who miss their timeslot on sweep", async () => {
    const stub = room("heartbeat-expiry");
    const cfg = config({
      maxConcurrentUsers: 1,
      heartbeatTimeoutSeconds: 10,
      queueTimeoutSeconds: 1800,
    });

    const t0 = 1_000_000;
    await stub.join({
      queue: "heartbeat-expiry",
      config: cfg,
      visitorId: "keeper",
      now: t0,
    });
    const silent = await stub.join({
      queue: "heartbeat-expiry",
      config: cfg,
      visitorId: "silent",
      now: t0,
    });
    expect(silent.nextCheckAt).toBeGreaterThan(t0);

    // Past next_check_at + 120s grace — sweep expires before status can renew.
    const expired = await stub.status({
      queue: "heartbeat-expiry",
      config: cfg,
      visitorId: "silent",
      now: (silent.nextCheckAt ?? t0) + 121_000,
    });
    expect(expired).toEqual({ ok: false, code: "not_found" });
  });

  it("honors a shorter missed-slot grace from queue config / DO override", async () => {
    const stub = room("grace-override");
    const cfg = config({
      maxConcurrentUsers: 1,
      missedSlotGraceSeconds: 30,
    });
    await stub.setMissedSlotGraceSeconds({ missedSlotGraceSeconds: 30 });

    const t0 = 2_000_000;
    await stub.join({
      queue: "grace-override",
      config: cfg,
      visitorId: "keeper",
      now: t0,
    });
    const silent = await stub.join({
      queue: "grace-override",
      config: cfg,
      visitorId: "silent",
      now: t0,
    });
    const due = silent.nextCheckAt ?? t0;

    // Early read-only status (before the slot) must not renew or expire.
    const early = await stub.status({
      queue: "grace-override",
      config: cfg,
      visitorId: "silent",
      now: due - 1_000,
    });
    expect(early.ok).toBe(true);

    // Past due + 30s grace — expired (default 120s would still keep them).
    const expired = await stub.status({
      queue: "grace-override",
      config: cfg,
      visitorId: "silent",
      now: due + 31_000,
    });
    expect(expired).toEqual({ ok: false, code: "not_found" });
  });

  it("updates heartbeats for waiting visitors when the timeslot is due", async () => {
    const stub = room("heartbeat-ok");
    const cfg = config({ maxConcurrentUsers: 1 });
    const t0 = 5_000_000;

    await stub.join({
      queue: "heartbeat-ok",
      config: cfg,
      visitorId: "seat",
      now: t0,
    });
    const joined = await stub.join({
      queue: "heartbeat-ok",
      config: cfg,
      visitorId: "waiter",
      now: t0,
    });
    expect(joined.nextCheckAt).toBeGreaterThan(t0);

    const early = await stub.heartbeat({
      queue: "heartbeat-ok",
      config: cfg,
      visitorId: "waiter",
      now: t0 + 1_000,
    });
    expect(early.ok).toBe(true);
    if (early.ok) {
      expect(early.visitor.lastHeartbeatAt).toBe(t0);
      expect(early.visitor.nextCheckAt).toBe(joined.nextCheckAt);
    }

    const dueAt = (joined.nextCheckAt ?? t0) + 1;
    const beat = await stub.heartbeat({
      queue: "heartbeat-ok",
      config: cfg,
      visitorId: "waiter",
      now: dueAt,
    });

    expect(beat.ok).toBe(true);
    if (beat.ok) {
      expect(beat.visitor.status).toBe("waiting");
      expect(beat.visitor.lastHeartbeatAt).toBe(dueAt);
      expect(beat.visitor.nextCheckAt).toBeGreaterThan(dueAt);
      expect(beat.visitor.nextPollAfterMs).toBeGreaterThanOrEqual(1_000);
    }
  });

  it("renews next_check_at on due status polls and stays read-only when early", async () => {
    const stub = room("status-heartbeat");
    const cfg = config({ maxConcurrentUsers: 1, heartbeatTimeoutSeconds: 30 });
    const t0 = 8_000_000;

    await stub.join({
      queue: "status-heartbeat",
      config: cfg,
      visitorId: "seat",
      now: t0,
    });
    const joined = await stub.join({
      queue: "status-heartbeat",
      config: cfg,
      visitorId: "waiter",
      now: t0,
    });

    const early = await stub.status({
      queue: "status-heartbeat",
      config: cfg,
      visitorId: "waiter",
      now: t0 + 1_000,
    });
    expect(early.ok).toBe(true);
    if (early.ok) {
      expect(early.visitor.lastHeartbeatAt).toBe(t0);
      expect(early.visitor.nextCheckAt).toBe(joined.nextCheckAt);
    }

    const dueAt = (joined.nextCheckAt ?? t0) + 1;
    const refreshed = await stub.status({
      queue: "status-heartbeat",
      config: cfg,
      visitorId: "waiter",
      now: dueAt,
    });
    expect(refreshed.ok).toBe(true);
    if (refreshed.ok) {
      expect(refreshed.visitor.lastHeartbeatAt).toBe(dueAt);
      expect(refreshed.visitor.nextCheckAt).toBeGreaterThan(dueAt);
      expect(refreshed.visitor.nextPollAfterMs).toBeGreaterThanOrEqual(1_000);
    }

    const stillWaiting = await stub.status({
      queue: "status-heartbeat",
      config: cfg,
      visitorId: "waiter",
      now: dueAt + 1_000,
    });
    expect(stillWaiting.ok).toBe(true);
    if (stillWaiting.ok) {
      expect(stillWaiting.visitor.lastHeartbeatAt).toBe(dueAt);
    }
  });

  it("rate-limits admission through the alarm while paused slots stay closed", async () => {
    const stub = room("alarm-rate");
    const cfg = config({ maxConcurrentUsers: 2, admitPerSecond: 2 });

    await stub.setPaused(true);
    await stub.join({ queue: "alarm-rate", config: cfg, visitorId: "w1" });
    await stub.join({ queue: "alarm-rate", config: cfg, visitorId: "w2" });
    await stub.join({ queue: "alarm-rate", config: cfg, visitorId: "w3" });

    const before = await stub.metrics({ queue: "alarm-rate", config: cfg });
    expect(before.waiting).toBe(3);
    expect(before.admitted).toBe(0);
    expect(before.paused).toBe(true);

    await stub.setPaused(false);
    const ran = await runDurableObjectAlarm(stub);
    expect(ran).toBe(true);

    const after = await stub.metrics({ queue: "alarm-rate", config: cfg });
    expect(after.admitted).toBe(2);
    expect(after.waiting).toBe(1);
    expect(after.paused).toBe(false);
  });

  it("reports queue metrics without writing external state", async () => {
    const stub = room("metrics-room");
    const cfg = config({ maxConcurrentUsers: 2, admitPerSecond: 2 });

    await stub.join({ queue: "metrics-room", config: cfg, visitorId: "a" });
    await stub.join({ queue: "metrics-room", config: cfg, visitorId: "b" });
    await stub.join({ queue: "metrics-room", config: cfg, visitorId: "c" });

    const metrics = await stub.metrics({ queue: "metrics-room", config: cfg });
    expect(metrics).toMatchObject({
      queue: "metrics-room",
      waiting: 1,
      admitted: 2,
      capacity: 2,
      admitPerSecond: 2,
      paused: false,
      admissionMode: "queue",
    });
    expect(metrics.estimatedWaitSeconds).toBe(1);
  });
});

describe("QueueRoom Lottery Mode", () => {
  it("hides FIFO position and reports equal lottery odds", async () => {
    const stub = room("lottery-odds");
    const cfg = config({ maxConcurrentUsers: 1, admissionMode: "lottery" });
    await stub.setAdmitUx({
      queue: "lottery-odds",
      config: cfg,
      requireClickToEnter: false,
      admitHoldSeconds: 0,
      showWaitingCount: true,
    });

    await stub.join({ queue: "lottery-odds", config: cfg, visitorId: "seat" });
    const first = await stub.join({ queue: "lottery-odds", config: cfg, visitorId: "w1" });
    const second = await stub.join({ queue: "lottery-odds", config: cfg, visitorId: "w2" });

    expect(first.status).toBe("waiting");
    expect(first.position).toBeNull();
    expect(first.admissionMode).toBe("lottery");
    // Odds are computed at response time — alone in line ⇒ certainty of being next.
    expect(first.lotteryOdds).toBe(1);

    expect(second.position).toBeNull();
    expect(second.lotteryOdds).toBeCloseTo(0.5);

    const refreshed = await stub.status({
      queue: "lottery-odds",
      config: cfg,
      visitorId: "w1",
    });
    expect(refreshed.ok).toBe(true);
    if (refreshed.ok) {
      expect(refreshed.visitor.lotteryOdds).toBeCloseTo(0.5);
    }
  });

  it("switches mode at runtime via setMode", async () => {
    const stub = room("lottery-switch");
    const cfg = config({ maxConcurrentUsers: 1, admissionMode: "queue" });

    await stub.join({ queue: "lottery-switch", config: cfg, visitorId: "seat" });
    await stub.join({ queue: "lottery-switch", config: cfg, visitorId: "waiter" });

    const before = await stub.status({
      queue: "lottery-switch",
      config: cfg,
      visitorId: "waiter",
    });
    expect(before.ok).toBe(true);
    if (before.ok) {
      expect(before.visitor.admissionMode).toBe("queue");
      expect(before.visitor.position).toBe(1);
    }

    await stub.setMode({ queue: "lottery-switch", config: cfg, mode: "lottery" });

    const after = await stub.status({
      queue: "lottery-switch",
      config: cfg,
      visitorId: "waiter",
    });
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.visitor.admissionMode).toBe("lottery");
      expect(after.visitor.position).toBeNull();
      expect(after.visitor.lotteryOdds).toBe(1);
    }
  });

  it("can admit a later joiner before an earlier one under lottery", async () => {
    const winners: Array<"early" | "late"> = [];

    for (let i = 0; i < 24; i += 1) {
      const queue = `lottery-rand-${i}`;
      const stub = room(queue);
      const cfg = config({
        maxConcurrentUsers: 1,
        admissionMode: "lottery",
        admitPerSecond: 100,
      });

      await stub.join({ queue, config: cfg, visitorId: "seat" });
      await stub.join({ queue, config: cfg, visitorId: "early" });
      await stub.join({ queue, config: cfg, visitorId: "late" });
      await stub.leave({ queue, config: cfg, visitorId: "seat" });

      const late = await stub.status({ queue, config: cfg, visitorId: "late" });
      winners.push(late.ok && late.visitor.status === "admitted" ? "late" : "early");
    }

    expect(winners).toContain("early");
    expect(winners).toContain("late");
  });
});
