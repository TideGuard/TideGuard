import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BRANDING } from "../src/core/branding";
import { writeBranding } from "../src/admin/store";
import {
  DEFAULT_WEBHOOK_SETTINGS,
  parseWebhookEvents,
  writeWebhookSettings,
} from "../src/admin/webhook-store";
import {
  dispatchWebhook,
  maybeDispatchOriginUnhealthyWebhook,
} from "../src/admin/webhook-dispatch";
import { checkInPeriodSeconds } from "../src/queue/engine";
import { ADMIN_SECRET, cookieFrom, resetAdmin, setupAdmin } from "./helpers/admin-setup";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function mockEnv(store = new Map<string, string>(), enqueued: unknown[] = []): Env {
  return {
    TOKEN_SECRET: ADMIN_SECRET,
    CONFIG_KV: {
      get: async (key: string, type?: string) => {
        const raw = store.get(key);
        if (!raw) return null;
        return type === "json" ? JSON.parse(raw) : raw;
      },
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
    },
    QUEUE_ROOM: {
      getByName: () => ({
        enqueueWebhook: async (delivery: unknown) => {
          enqueued.push(delivery);
        },
      }),
    },
  } as unknown as Env;
}

describe("closesAt passthrough", () => {
  it("lets /demo through after close when closeAction is passthrough", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("passthrough-ops", undefined, { queue: "pass-q" });
    const closesAt = Date.now() - 1_000;

    const schedule = await exports.default.fetch(
      new Request("https://example.com/api/admin/schedule", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          queue: "pass-q",
          opensAt: null,
          closesAt,
          closeAction: "passthrough",
        }),
      }),
    );
    expect(schedule.status).toBe(200);
    const body = await json<{
      roomPhase: string;
      closeAction: string;
      closesAt: number | null;
    }>(schedule);
    expect(body.roomPhase).toBe("closed");
    expect(body.closeAction).toBe("passthrough");
    expect(body.closesAt).toBe(closesAt);

    const demo = await exports.default.fetch(
      new Request("https://example.com/demo?queue=pass-q", { redirect: "manual" }),
    );
    expect(demo.status).toBe(200);
    const html = await demo.text();
    expect(html).toContain("schedule_passthrough");
  });

  it("keeps /demo redirecting to /wait after close when closeAction is reject", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("reject-ops", undefined, { queue: "reject-q" });

    const schedule = await exports.default.fetch(
      new Request("https://example.com/api/admin/schedule", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          queue: "reject-q",
          opensAt: null,
          closesAt: Date.now() - 1_000,
          closeAction: "reject",
        }),
      }),
    );
    expect(schedule.status).toBe(200);

    const demo = await exports.default.fetch(
      new Request("https://example.com/demo?queue=reject-q", { redirect: "manual" }),
    );
    expect(demo.status).toBe(302);
    expect(demo.headers.get("location")).toContain("/wait");
  });
});

describe("admin schedule and revoke HTTP", () => {
  it("rejects invalid closeAction and closesAt before opensAt", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("sched-ops");

    const badAction = await exports.default.fetch(
      new Request("https://example.com/api/admin/schedule", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ queue: "default", closeAction: "skip" }),
      }),
    );
    expect(badAction.status).toBe(400);

    const badOrder = await exports.default.fetch(
      new Request("https://example.com/api/admin/schedule", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          queue: "default",
          opensAt: Date.now() + 60_000,
          closesAt: Date.now() + 1_000,
          closeAction: "reject",
        }),
      }),
    );
    expect(badOrder.status).toBe(400);
  });

  it("revokes admissions so previously valid cookies no longer unlock /demo", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("revoke-ops", undefined, { queue: "revoke-q" });

    const join = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "revoke-q" }),
      }),
    );
    expect(join.status).toBe(200);
    const accessCookie = cookieFrom(join);
    expect(accessCookie).toContain("tg_access=");

    const before = await exports.default.fetch(
      new Request("https://example.com/demo?queue=revoke-q", {
        headers: { cookie: accessCookie },
      }),
    );
    expect(before.status).toBe(200);

    const revoke = await exports.default.fetch(
      new Request("https://example.com/api/admin/revoke-admissions", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ queue: "revoke-q" }),
      }),
    );
    expect(revoke.status).toBe(200);
    const revoked = await json<{ tokenEpoch: number }>(revoke);
    expect(revoked.tokenEpoch).toBeGreaterThan(0);

    const after = await exports.default.fetch(
      new Request("https://example.com/demo?queue=revoke-q", {
        redirect: "manual",
        headers: { cookie: accessCookie },
      }),
    );
    expect(after.status).toBe(302);
    expect(after.headers.get("location")).toContain("/wait");
  });
});

describe("waiting-room rules end-to-end", () => {
  it("saves rules and bypasses /demo for SEO crawlers and trusted cookies", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("rules-ops", undefined, { queue: "rules-q" });

    const save = await exports.default.fetch(
      new Request("https://example.com/api/admin/room-rules", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          seoCrawlerBypass: true,
          cookieBypassName: "tg_trusted",
          headerBypassName: "x-staff",
          headerBypassValue: "1",
          jsonMode: true,
          rejectWhenFull: false,
        }),
      }),
    );
    expect(save.status).toBe(200);

    const crawler = await exports.default.fetch(
      new Request("https://example.com/demo?queue=rules-q", {
        headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      }),
    );
    expect(crawler.status).toBe(200);

    const trusted = await exports.default.fetch(
      new Request("https://example.com/demo?queue=rules-q", {
        headers: { cookie: "tg_trusted=1" },
      }),
    );
    expect(trusted.status).toBe(200);

    const header = await exports.default.fetch(
      new Request("https://example.com/demo?queue=rules-q", {
        headers: { "x-staff": "1" },
      }),
    );
    expect(header.status).toBe(200);

    const jsonRedirect = await exports.default.fetch(
      new Request("https://example.com/demo?queue=rules-q", {
        redirect: "manual",
        headers: { accept: "application/json" },
      }),
    );
    expect(jsonRedirect.status).toBe(200);
    expect(jsonRedirect.headers.get("content-type")).toContain("application/json");
    const body = await json<{ redirect: string }>(jsonRedirect);
    expect(body.redirect).toContain("/wait");
    expect(body.redirect).toContain("queue=rules-q");
  });

  it("returns branded 503 on /wait when rejectWhenFull and the queue is at capacity", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("full-ops", undefined, { queue: "full-q" });

    const limits = await exports.default.fetch(
      new Request("https://example.com/api/admin/queue-limits?queue=full-q", {
        headers: { cookie },
      }),
    );
    const before = await json<{
      maxWaitingVisitors: number;
      missedSlotGraceSeconds: number;
    }>(limits);

    const putLimits = await exports.default.fetch(
      new Request("https://example.com/api/admin/queue-limits", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          queue: "full-q",
          maxWaitingVisitors: 1,
          previousMaxWaitingVisitors: before.maxWaitingVisitors,
          missedSlotGraceSeconds: before.missedSlotGraceSeconds,
          previousMissedSlotGraceSeconds: before.missedSlotGraceSeconds,
          confirmChanges: true,
        }),
      }),
    );
    expect(putLimits.status).toBe(200);

    const pause = await exports.default.fetch(
      new Request("https://example.com/api/admin/pause", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ queue: "full-q", paused: true }),
      }),
    );
    expect(pause.status).toBe(200);

    const join = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "full-q" }),
      }),
    );
    expect([200, 202]).toContain(join.status);

    const saveRules = await exports.default.fetch(
      new Request("https://example.com/api/admin/room-rules", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ rejectWhenFull: true }),
      }),
    );
    expect(saveRules.status).toBe(200);

    const wait = await exports.default.fetch(
      new Request("https://example.com/wait?queue=full-q", { redirect: "manual" }),
    );
    expect(wait.status).toBe(503);
    const html = await wait.text();
    expect(html).toMatch(/waiting room is full/i);
  });
});

describe("multi-queue admin", () => {
  it("remembers queues from state and clones branding", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("mq-ops");

    await writeBranding(env, "default", {
      ...DEFAULT_BRANDING,
      title: "Main room",
      message: "Source branding",
    });

    const otherState = await exports.default.fetch(
      new Request("https://example.com/api/admin/state?queue=tickets", {
        headers: { cookie },
      }),
    );
    expect(otherState.status).toBe(200);
    const state = await json<{ knownQueues: string[]; queue: string }>(otherState);
    expect(state.queue).toBe("tickets");
    expect(state.knownQueues).toEqual(expect.arrayContaining(["default", "tickets"]));

    const clone = await exports.default.fetch(
      new Request("https://example.com/api/admin/queues/clone-branding", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ from: "default", to: "tickets" }),
      }),
    );
    expect(clone.status).toBe(200);
    const cloned = await json<{ branding: { title: string } }>(clone);
    expect(cloned.branding.title).toBe("Main room");

    const ticketsState = await exports.default.fetch(
      new Request("https://example.com/api/admin/state?queue=tickets", {
        headers: { cookie },
      }),
    );
    const tickets = await json<{ branding: { title: string; message: string } }>(ticketsState);
    expect(tickets.branding.title).toBe("Main room");
    expect(tickets.branding.message).toBe("Source branding");
  });
});

describe("new webhook events", () => {
  it("parses the expanded event set", () => {
    expect(
      parseWebhookEvents([
        "pause",
        "opened",
        "origin_unhealthy",
        "queue_full",
        "admit_rate_changed",
        "nope",
      ]),
    ).toEqual(["pause", "opened", "origin_unhealthy", "queue_full", "admit_rate_changed"]);
  });

  it("delivers opened, queue_full, and admit_rate_changed payloads", async () => {
    const store = new Map<string, string>();
    const enqueued: Array<{ body: string }> = [];
    const mock = mockEnv(store, enqueued);
    await writeWebhookSettings(mock, {
      ...DEFAULT_WEBHOOK_SETTINGS,
      enabled: true,
      url: "https://hooks.example.com/tg",
      events: ["opened", "queue_full", "admit_rate_changed"],
      updatedAt: 1,
    });

    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchWebhook(mock, "opened", "hook-q", { opensAt: null });
    await dispatchWebhook(mock, "queue_full", "hook-q", { maxWaitingVisitors: 1 });
    await dispatchWebhook(mock, "admit_rate_changed", "hook-q", { admitPerSecond: 3 });
    await dispatchWebhook(mock, "pause", "hook-q", { paused: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const events = fetchMock.mock.calls.map(([, init]) => {
      const rawBody = (init as RequestInit | undefined)?.body;
      const bodyText = typeof rawBody === "string" ? rawBody : "{}";
      const payload = JSON.parse(bodyText) as { event: string };
      return payload.event;
    });
    expect(events).toEqual(["opened", "queue_full", "admit_rate_changed"]);
    expect(enqueued).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it("enqueues failed deliveries and fires origin_unhealthy once per transition", async () => {
    const store = new Map<string, string>();
    const enqueued: Array<{ event: string; body: string }> = [];
    const mock = mockEnv(store, enqueued);
    await writeWebhookSettings(mock, {
      ...DEFAULT_WEBHOOK_SETTINGS,
      enabled: true,
      url: "https://hooks.example.com/tg",
      events: ["opened", "origin_unhealthy"],
      updatedAt: 1,
    });

    const fetchMock = vi.fn(async () => new Response("no", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchWebhook(mock, "opened", "default", { opensAt: null });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]?.event).toBe("opened");
    expect(JSON.parse(enqueued[0]!.body).event).toBe("opened");

    await maybeDispatchOriginUnhealthyWebhook(mock, "default", true, { level: 2 });
    await maybeDispatchOriginUnhealthyWebhook(mock, "default", true, { level: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // opened + one unhealthy
    expect(enqueued).toHaveLength(2);

    await maybeDispatchOriginUnhealthyWebhook(mock, "default", false, { level: 0 });
    await maybeDispatchOriginUnhealthyWebhook(mock, "default", true, { level: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(enqueued).toHaveLength(3);

    vi.unstubAllGlobals();
  });

  it("opens the room via schedule API when opensAt moves into the past", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("open-hook-ops", undefined, { queue: "open-q" });

    const future = await exports.default.fetch(
      new Request("https://example.com/api/admin/schedule", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ queue: "open-q", opensAt: Date.now() + 60_000 }),
      }),
    );
    expect(future.status).toBe(200);
    expect((await json<{ roomPhase: string }>(future)).roomPhase).toBe("scheduled");

    const opened = await exports.default.fetch(
      new Request("https://example.com/api/admin/schedule", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ queue: "open-q", opensAt: null }),
      }),
    );
    expect(opened.status).toBe(200);
    expect((await json<{ roomPhase: string }>(opened)).roomPhase).toBe("open");
  });
});

describe("admin depth warning", () => {
  it("exposes check-in period fields and warns at the 120s threshold", async () => {
    expect(checkInPeriodSeconds(0)).toBe(5);
    expect(checkInPeriodSeconds(90_000)).toBe(120);
    expect(checkInPeriodSeconds(90_000) >= 120).toBe(true);

    await resetAdmin();
    const cookie = await setupAdmin("depth-ops");
    const state = await exports.default.fetch(
      new Request("https://example.com/api/admin/state?queue=default", {
        headers: { cookie },
      }),
    );
    expect(state.status).toBe(200);
    const body = await json<{
      metrics: { waiting: number; checkInPeriodSeconds: number; checkInPeriodWarning: boolean };
    }>(state);
    expect(body.metrics.waiting).toBe(0);
    expect(body.metrics.checkInPeriodSeconds).toBe(5);
    expect(body.metrics.checkInPeriodWarning).toBe(false);
  });
});
