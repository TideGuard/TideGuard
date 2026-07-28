import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { verifyAccessToken } from "../src/auth";

const SECRET = "test-token-secret-do-not-use-in-production";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("queue REST API", () => {
  it("joins and returns an access token when capacity is available", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "api-join", visitorId: "u1" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await json<{
      visitorId: string;
      status: string;
      accessToken?: string;
    }>(response);

    expect(body).toMatchObject({ visitorId: "u1", status: "admitted" });
    expect(body.accessToken).toBeTypeOf("string");

    const claims = await verifyAccessToken(body.accessToken!, SECRET, {
      expectedQueue: "api-join",
    });
    expect(claims.sub).toBe("u1");
  });

  it("returns status with an access token for admitted visitors", async () => {
    const join = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "api-status", visitorId: "a" }),
      }),
    );
    expect(join.status).toBe(200);

    const status = await exports.default.fetch(
      new Request("https://example.com/status?queue=api-status&id=a"),
    );
    expect(status.status).toBe(200);
    const body = await json<{ status: string; accessToken?: string }>(status);
    expect(body.status).toBe("admitted");
    expect(body.accessToken).toBeTypeOf("string");
  });

  it("heartbeats, leaves, and reports metrics", async () => {
    const queue = "api-lifecycle";

    // Fill the queue to capacity so the next visitor waits.
    for (let i = 0; i < 20; i += 1) {
      const fill = await exports.default.fetch(
        new Request("https://example.com/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ queue, visitorId: `seat-${i}` }),
        }),
      );
      expect(fill.status).toBe(200);
    }

    const waiting = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue, visitorId: "waiter" }),
      }),
    );
    expect(waiting.status).toBe(202);
    const waitingBody = await json<{
      status: string;
      position: number | null;
      admissionMode?: string;
      waiting?: number;
      ahead?: number;
      behind?: number;
      accessToken?: string;
    }>(waiting);
    expect(waitingBody.status).toBe("waiting");
    expect(waitingBody.position).toBe(1);
    expect(waitingBody.admissionMode).toBe("queue");
    expect(waitingBody.waiting).toBe(1);
    expect(waitingBody.ahead).toBe(0);
    expect(waitingBody.behind).toBe(0);
    expect(waitingBody.accessToken).toBeUndefined();

    const beat = await exports.default.fetch(
      new Request("https://example.com/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue, visitorId: "waiter" }),
      }),
    );
    expect(beat.status).toBe(200);

    const metrics = await exports.default.fetch(
      new Request(`https://example.com/metrics?queue=${queue}`),
    );
    expect(metrics.status).toBe(200);
    const metricsBody = await json<{
      waiting: number;
      admitted: number;
      capacity: number;
      admissionMode: string;
    }>(metrics);
    expect(metricsBody).toMatchObject({
      waiting: 1,
      admitted: 20,
      capacity: 20,
      admissionMode: "queue",
    });

    const leave = await exports.default.fetch(
      new Request("https://example.com/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue, visitorId: "seat-0" }),
      }),
    );
    expect(leave.status).toBe(200);

    const promoted = await exports.default.fetch(
      new Request(`https://example.com/status?queue=${queue}&id=waiter`),
    );
    const promotedBody = await json<{ status: string; accessToken?: string }>(promoted);
    expect(promotedBody.status).toBe("admitted");
    expect(promotedBody.accessToken).toBeTypeOf("string");
  });

  it("requires operator auth for /admit", async () => {
    const denied = await exports.default.fetch(
      new Request("https://example.com/admit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "api-admit", count: 1 }),
      }),
    );
    expect(denied.status).toBe(401);

    const allowed = await exports.default.fetch(
      new Request("https://example.com/admit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({ queue: "api-admit", count: 1 }),
      }),
    );
    expect(allowed.status).toBe(200);
  });

  it("switches admission mode via /mode", async () => {
    const queue = "api-mode";

    for (let i = 0; i < 20; i += 1) {
      await exports.default.fetch(
        new Request("https://example.com/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ queue, visitorId: `seat-${i}` }),
        }),
      );
    }

    const denied = await exports.default.fetch(
      new Request("https://example.com/mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue, mode: "lottery" }),
      }),
    );
    expect(denied.status).toBe(401);

    const switched = await exports.default.fetch(
      new Request("https://example.com/mode", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({ queue, mode: "lottery" }),
      }),
    );
    expect(switched.status).toBe(200);
    expect(await json(switched)).toEqual({ admissionMode: "lottery" });

    const waiting = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue, visitorId: "lottery-waiter" }),
      }),
    );
    expect(waiting.status).toBe(202);
    const body = await json<{
      admissionMode: string;
      position: number | null;
      lotteryOdds?: number;
    }>(waiting);
    expect(body.admissionMode).toBe("lottery");
    expect(body.position).toBeNull();
    expect(body.lotteryOdds).toBe(1);

    const metrics = await exports.default.fetch(
      new Request(`https://example.com/metrics?queue=${queue}`),
    );
    const metricsBody = await json<{ admissionMode: string }>(metrics);
    expect(metricsBody.admissionMode).toBe("lottery");
  });

  it("rejects invalid join payloads", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "bad queue!!" }),
      }),
    );
    expect(response.status).toBe(400);
    const body = await json<{ error: { code: string } }>(response);
    expect(body.error.code).toBe("bad_request");
  });
});
