import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { verifyAccessToken } from "../src/auth";
import { DEFAULT_QUEUE_CONFIG } from "../src/core/config";

const SECRET = "test-token-secret-do-not-use-in-production";

async function enableDepth(queue: string): Promise<void> {
  await env.QUEUE_ROOM.getByName(queue).setAdmitUx({
    queue,
    config: DEFAULT_QUEUE_CONFIG,
    requireClickToEnter: false,
    admitHoldSeconds: 0,
    showWaitingCount: true,
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function cookiesFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length > 0) {
    return raw.map((c) => c.split(";")[0]!).join("; ");
  }
  const single = response.headers.get("set-cookie");
  return single ? single.split(";")[0]! : "";
}

function mergeCookies(...parts: string[]): string {
  return parts.filter(Boolean).join("; ");
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
    expect((body as { admissionOpen?: boolean }).admissionOpen).toBe(true);
    expect(cookiesFrom(response)).toContain("tg_ticket=");
    expect(cookiesFrom(response)).toContain("tg_access=");

    const claims = await verifyAccessToken(body.accessToken!, SECRET, {
      expectedQueue: "api-join",
    });
    expect(claims.sub).toBe("u1");
  });

  it("returns status with an access token only when the visitor ticket is present", async () => {
    const join = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "api-status", visitorId: "a" }),
      }),
    );
    expect(join.status).toBe(200);
    const ticket = cookiesFrom(join);

    const denied = await exports.default.fetch(
      new Request("https://example.com/status?queue=api-status&id=a"),
    );
    expect(denied.status).toBe(401);

    const status = await exports.default.fetch(
      new Request("https://example.com/status?queue=api-status&id=a", {
        headers: { cookie: ticket },
      }),
    );
    expect(status.status).toBe(200);
    const body = await json<{ status: string; accessToken?: string }>(status);
    expect(body.status).toBe("admitted");
    expect(body.accessToken).toBeTypeOf("string");
  });

  it("heartbeats, leaves, and reports metrics", async () => {
    const queue = "api-lifecycle";
    const seatCookies: string[] = [];
    await enableDepth(queue);

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
      seatCookies[i] = cookiesFrom(fill);
    }

    const waiting = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue, visitorId: "waiter" }),
      }),
    );
    expect(waiting.status).toBe(202);
    const waiterCookie = cookiesFrom(waiting);
    const waitingBody = await json<{
      status: string;
      position: number | null;
      admissionMode?: string;
      waiting?: number;
      ahead?: number;
      behind?: number;
      accessToken?: string;
      admissionOpen?: boolean;
      nextCheckAt?: number;
    }>(waiting);
    expect(waitingBody.status).toBe("waiting");
    expect(waitingBody.position).toBe(1);
    expect(waitingBody.admissionMode).toBe("queue");
    expect(waitingBody.waiting).toBe(1);
    expect(waitingBody.ahead).toBe(0);
    expect(waitingBody.behind).toBe(0);
    expect(waitingBody.admissionOpen).toBe(true);
    expect(waitingBody.nextCheckAt).toBeTypeOf("number");
    expect(waitingBody.accessToken).toBeUndefined();

    const beat = await exports.default.fetch(
      new Request("https://example.com/heartbeat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: waiterCookie,
        },
        body: JSON.stringify({ queue, visitorId: "waiter" }),
      }),
    );
    expect(beat.status).toBe(200);

    const metricsDenied = await exports.default.fetch(
      new Request(`https://example.com/metrics?queue=${queue}`),
    );
    expect(metricsDenied.status).toBe(401);

    const metrics = await exports.default.fetch(
      new Request(`https://example.com/metrics?queue=${queue}`, {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
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
        headers: {
          "content-type": "application/json",
          cookie: seatCookies[0]!,
        },
        body: JSON.stringify({ queue, visitorId: "seat-0" }),
      }),
    );
    expect(leave.status).toBe(200);

    const promoted = await exports.default.fetch(
      new Request(`https://example.com/status?queue=${queue}&id=waiter`, {
        headers: { cookie: waiterCookie },
      }),
    );
    const promotedBody = await json<{ status: string; accessToken?: string }>(promoted);
    expect(promotedBody.status).toBe("admitted");
    expect(promotedBody.accessToken).toBeTypeOf("string");
  });

  it("requires operator auth for /admit and admits waiters when authorized", async () => {
    const denied = await exports.default.fetch(
      new Request("https://example.com/admit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "api-admit", count: 1 }),
      }),
    );
    expect(denied.status).toBe(401);

    const { env } = await import("cloudflare:workers");
    const queue = "api-admit";
    const cfg = { ...DEFAULT_QUEUE_CONFIG, maxConcurrentUsers: 10, admitPerSecond: 1 };
    const room = env.QUEUE_ROOM.getByName(queue);
    await room.setPaused(true);
    await room.join({ queue, config: cfg, visitorId: "w1" });
    await room.join({ queue, config: cfg, visitorId: "w2" });
    await room.setPaused(false);

    const allowed = await exports.default.fetch(
      new Request("https://example.com/admit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({ queue, count: 2 }),
      }),
    );
    expect(allowed.status).toBe(200);
    const body = await json<{ admitted: string[] }>(allowed);
    expect(body.admitted).toHaveLength(2);
  });

  it("switches admission mode with operator auth", async () => {
    await enableDepth("api-mode");
    for (let i = 0; i < 20; i += 1) {
      await exports.default.fetch(
        new Request("https://example.com/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ queue: "api-mode", visitorId: `fill-${i}` }),
        }),
      );
    }

    const mode = await exports.default.fetch(
      new Request("https://example.com/mode", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({ queue: "api-mode", mode: "lottery" }),
      }),
    );
    expect(mode.status).toBe(200);
    expect(await json(mode)).toMatchObject({ admissionMode: "lottery" });

    const waiter = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "api-mode", visitorId: "lotto" }),
      }),
    );
    expect(waiter.status).toBe(202);
    const body = await json<{
      admissionMode: string;
      lotteryOdds?: number;
      position?: number | null;
    }>(waiter);
    expect(body.admissionMode).toBe("lottery");
    expect(body.position).toBeNull();
    expect(body.lotteryOdds).toBe(1);
  });

  it("omits depth fields unless showWaitingCount is enabled", async () => {
    const queue = "api-depth-off";
    for (let i = 0; i < 20; i += 1) {
      await exports.default.fetch(
        new Request("https://example.com/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ queue, visitorId: `fill-${i}` }),
        }),
      );
    }
    const waiting = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue, visitorId: "depth-waiter" }),
      }),
    );
    expect(waiting.status).toBe(202);
    const body = await json<Record<string, unknown>>(waiting);
    expect(body.waiting).toBeUndefined();
    expect(body.ahead).toBeUndefined();
    expect(body.behind).toBeUndefined();
  });

  it("resumes the ticket-bound visitor across tabs", async () => {
    const queue = "api-multitab";
    const first = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue, visitorId: "tab-a" }),
      }),
    );
    expect(first.status).toBe(200);
    const ticket = cookiesFrom(first);
    const firstBody = await json<{ visitorId: string }>(first);
    expect(firstBody.visitorId).toBe("tab-a");

    const second = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: ticket,
        },
        body: JSON.stringify({ queue, visitorId: "tab-b-conflicting" }),
      }),
    );
    expect(second.status).toBe(200);
    const secondBody = await json<{ visitorId: string }>(second);
    expect(secondBody.visitorId).toBe("tab-a");
  });

  it("rejects status for unknown visitors", async () => {
    const join = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "api-missing", visitorId: "known" }),
      }),
    );
    const cookie = cookiesFrom(join);

    const missing = await exports.default.fetch(
      new Request("https://example.com/status?queue=api-missing&id=unknown", {
        headers: { cookie: mergeCookies(cookie) },
      }),
    );
    // Ticket is for "known", so visitor mismatch → 401
    expect(missing.status).toBe(401);
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
