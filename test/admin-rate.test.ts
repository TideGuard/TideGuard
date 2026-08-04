import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { resetAdmin, setupAdmin } from "./helpers/admin-setup";

describe("admin rate and traffic APIs", () => {
  it("sets and clears admit rate via session", async () => {
    await resetAdmin();
    const cookie = await setupAdmin();

    const set = await exports.default.fetch(
      new Request("https://example.com/api/admin/rate", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ queue: "default", admitPerSecond: 7.5 }),
      }),
    );
    expect(set.status).toBe(200);
    const setBody = (await set.json()) as {
      admitPerSecond: number;
      admitPerSecondOverride: number;
    };
    expect(setBody.admitPerSecond).toBe(7.5);
    expect(setBody.admitPerSecondOverride).toBe(7.5);

    const metrics = await exports.default.fetch(
      new Request("https://example.com/api/admin/metrics?queue=default", {
        headers: { cookie },
      }),
    );
    expect(metrics.status).toBe(200);
    const m = (await metrics.json()) as { metrics: { admitPerSecond: number } };
    expect(m.metrics.admitPerSecond).toBe(7.5);

    const clear = await exports.default.fetch(
      new Request("https://example.com/api/admin/rate?queue=default", {
        method: "DELETE",
        headers: { cookie },
      }),
    );
    expect(clear.status).toBe(200);

    const traffic = await exports.default.fetch(
      new Request("https://example.com/api/admin/traffic?queue=default", {
        headers: { cookie },
      }),
    );
    expect(traffic.status).toBe(200);
    const t = (await traffic.json()) as { buckets: unknown[]; totalInflow: number };
    expect(Array.isArray(t.buckets)).toBe(true);
    expect(typeof t.totalInflow).toBe("number");

    const csv = await exports.default.fetch(
      new Request("https://example.com/api/admin/traffic?queue=default&format=csv", {
        headers: { cookie },
      }),
    );
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const csvBody = await csv.text();
    expect(csvBody.startsWith("t,iso,joins,admits,maxOutflow,waiting,entered")).toBe(true);
  });

  it("saves and returns webhooks on state", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("webhook-ops");

    const save = await exports.default.fetch(
      new Request("https://example.com/api/admin/webhooks", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          enabled: true,
          url: "https://hooks.example.com/tideguard",
          events: ["pause", "depth"],
          depthThreshold: 42,
          signingSecret: "hook-secret",
        }),
      }),
    );
    expect(save.status).toBe(200);
    const saved = (await save.json()) as {
      webhooks: { enabled: boolean; depthThreshold: number; hasSecret: boolean };
    };
    expect(saved.webhooks.enabled).toBe(true);
    expect(saved.webhooks.depthThreshold).toBe(42);
    expect(saved.webhooks.hasSecret).toBe(true);

    const state = await exports.default.fetch(
      new Request("https://example.com/api/admin/state?queue=default", {
        headers: { cookie },
      }),
    );
    expect(state.status).toBe(200);
    const body = (await state.json()) as {
      webhooks: { enabled: boolean; url: string; events: string[] };
    };
    expect(body.webhooks.enabled).toBe(true);
    expect(body.webhooks.url).toContain("hooks.example.com");
    expect(body.webhooks.events).toContain("pause");

    const bad = await exports.default.fetch(
      new Request("https://example.com/api/admin/webhooks", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          enabled: true,
          url: "http://insecure.example.com/hook",
        }),
      }),
    );
    expect(bad.status).toBe(400);

    const missingUrl = await exports.default.fetch(
      new Request("https://example.com/api/admin/webhooks", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ enabled: true, url: "" }),
      }),
    );
    expect(missingUrl.status).toBe(400);

    const cleared = await exports.default.fetch(
      new Request("https://example.com/api/admin/webhooks", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          enabled: true,
          url: "https://hooks.example.com/tideguard",
          events: ["pause", "health"],
          clearSecret: true,
        }),
      }),
    );
    expect(cleared.status).toBe(200);
    const clearedBody = (await cleared.json()) as { webhooks: { hasSecret: boolean } };
    expect(clearedBody.webhooks.hasSecret).toBe(false);

    const pause = await exports.default.fetch(
      new Request("https://example.com/api/admin/pause", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ queue: "default", paused: true }),
      }),
    );
    expect(pause.status).toBe(200);

    const health = await exports.default.fetch(
      new Request("https://example.com/api/admin/health", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          queue: "default",
          enabled: false,
          url: null,
          intervalSeconds: 30,
          timeoutMs: 2000,
          maxLatencyMs: 2000,
          expectStatus: 200,
          failThreshold: 3,
          recoverThreshold: 2,
          slowRateMultiplier: 0.25,
        }),
      }),
    );
    expect(health.status).toBe(200);
  });

  it("rejects invalid rates", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("ops2");
    const bad = await exports.default.fetch(
      new Request("https://example.com/api/admin/rate", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ queue: "default", admitPerSecond: 0 }),
      }),
    );
    expect(bad.status).toBe(400);
  });
});
