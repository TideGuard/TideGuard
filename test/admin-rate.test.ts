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
