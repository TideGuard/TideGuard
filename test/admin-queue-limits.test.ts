import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { resetAdmin, setupAdmin } from "./helpers/admin-setup";

describe("admin queue-limits API", () => {
  it("reads defaults and updates max waiting + missed-slot grace with A→B confirm", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("limits-ops");

    const get = await exports.default.fetch(
      new Request("https://example.com/api/admin/queue-limits?queue=default", {
        headers: { cookie },
      }),
    );
    expect(get.status).toBe(200);
    const before = (await get.json()) as {
      maxWaitingVisitors: number;
      missedSlotGraceSeconds: number;
      defaultMaxWaitingVisitors: number;
      defaultMissedSlotGraceSeconds: number;
      minMissedSlotGraceSeconds: number;
      maxMissedSlotGraceSeconds: number;
    };
    expect(before.maxWaitingVisitors).toBe(before.defaultMaxWaitingVisitors);
    expect(before.missedSlotGraceSeconds).toBe(before.defaultMissedSlotGraceSeconds);
    expect(before.minMissedSlotGraceSeconds).toBe(30);
    expect(before.maxMissedSlotGraceSeconds).toBe(900);

    const put = await exports.default.fetch(
      new Request("https://example.com/api/admin/queue-limits", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          queue: "default",
          maxWaitingVisitors: 500_000,
          previousMaxWaitingVisitors: before.maxWaitingVisitors,
          missedSlotGraceSeconds: 60,
          previousMissedSlotGraceSeconds: before.missedSlotGraceSeconds,
          confirmChanges: true,
        }),
      }),
    );
    expect(put.status).toBe(200);
    const after = (await put.json()) as {
      maxWaitingVisitors: number;
      missedSlotGraceSeconds: number;
      changed: Array<{ field: string; from: number; to: number }>;
    };
    expect(after.maxWaitingVisitors).toBe(500_000);
    expect(after.missedSlotGraceSeconds).toBe(60);
    expect(after.changed).toEqual(
      expect.arrayContaining([
        { field: "maxWaitingVisitors", from: before.maxWaitingVisitors, to: 500_000 },
        {
          field: "missedSlotGraceSeconds",
          from: before.missedSlotGraceSeconds,
          to: 60,
        },
      ]),
    );

    const reread = await exports.default.fetch(
      new Request("https://example.com/api/admin/queue-limits?queue=default", {
        headers: { cookie },
      }),
    );
    expect(reread.status).toBe(200);
    const current = (await reread.json()) as {
      maxWaitingVisitors: number;
      missedSlotGraceSeconds: number;
    };
    expect(current.maxWaitingVisitors).toBe(500_000);
    expect(current.missedSlotGraceSeconds).toBe(60);
  });

  it("rejects missing confirm, stale previous values, and out-of-range grace", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("limits-err");

    const base = await exports.default.fetch(
      new Request("https://example.com/api/admin/queue-limits?queue=default", {
        headers: { cookie },
      }),
    );
    const limits = (await base.json()) as {
      maxWaitingVisitors: number;
      missedSlotGraceSeconds: number;
    };

    const noConfirm = await exports.default.fetch(
      new Request("https://example.com/api/admin/queue-limits", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          queue: "default",
          maxWaitingVisitors: limits.maxWaitingVisitors,
          previousMaxWaitingVisitors: limits.maxWaitingVisitors,
          missedSlotGraceSeconds: 90,
          previousMissedSlotGraceSeconds: limits.missedSlotGraceSeconds,
          confirmChanges: false,
        }),
      }),
    );
    expect(noConfirm.status).toBe(400);

    const stale = await exports.default.fetch(
      new Request("https://example.com/api/admin/queue-limits", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          queue: "default",
          maxWaitingVisitors: limits.maxWaitingVisitors,
          previousMaxWaitingVisitors: limits.maxWaitingVisitors,
          missedSlotGraceSeconds: 90,
          previousMissedSlotGraceSeconds: limits.missedSlotGraceSeconds + 1,
          confirmChanges: true,
        }),
      }),
    );
    expect(stale.status).toBe(409);

    const badGrace = await exports.default.fetch(
      new Request("https://example.com/api/admin/queue-limits", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          queue: "default",
          maxWaitingVisitors: limits.maxWaitingVisitors,
          previousMaxWaitingVisitors: limits.maxWaitingVisitors,
          missedSlotGraceSeconds: 10,
          previousMissedSlotGraceSeconds: limits.missedSlotGraceSeconds,
          confirmChanges: true,
        }),
      }),
    );
    expect(badGrace.status).toBe(400);

    const noop = await exports.default.fetch(
      new Request("https://example.com/api/admin/queue-limits", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          queue: "default",
          maxWaitingVisitors: limits.maxWaitingVisitors,
          previousMaxWaitingVisitors: limits.maxWaitingVisitors,
          missedSlotGraceSeconds: limits.missedSlotGraceSeconds,
          previousMissedSlotGraceSeconds: limits.missedSlotGraceSeconds,
          confirmChanges: true,
        }),
      }),
    );
    expect(noop.status).toBe(400);
  });
});
