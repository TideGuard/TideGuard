import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DEMO_LIMITS, demoSessionKey } from "../src/demo/session";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("live demo session flow", () => {
  it("creates an isolated session, joins FIFO waiters, admits, and gates the protected page", async () => {
    const created = await exports.default.fetch(
      new Request("https://example.com/api/demo/session", { method: "POST", body: "{}" }),
    );
    expect(created.status).toBe(200);
    const session = await json<{
      sessionId: string;
      queue: string;
      controllerToken: string;
      live: boolean;
    }>(created);
    expect(session.live).toBe(true);
    expect(session.queue).toContain(`demo-${session.sessionId}`);

    const joinA = await exports.default.fetch(
      new Request(`https://example.com/api/demo/${session.sessionId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(joinA.status).toBe(200);
    const visitorA = await json<{ visitorId: string; status: string; position: number | null }>(
      joinA,
    );
    const cookieA = cookieFrom(joinA);

    // Fill capacity (demo maxConcurrentUsers = 5) then force waiters via pause.
    await exports.default.fetch(
      new Request(`https://example.com/api/demo/${session.sessionId}/pause`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tideguard-demo-controller": session.controllerToken,
        },
        body: JSON.stringify({ paused: true }),
      }),
    );

    const joinB = await exports.default.fetch(
      new Request(`https://example.com/api/demo/${session.sessionId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(joinB.status).toBe(200);
    const visitorB = await json<{ visitorId: string; status: string; position: number | null }>(
      joinB,
    );
    const cookieB = cookieFrom(joinB);
    expect(visitorB.status).toBe("waiting");
    expect(visitorB.position).toBe(1);

    await exports.default.fetch(
      new Request(`https://example.com/api/demo/${session.sessionId}/pause`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tideguard-demo-controller": session.controllerToken,
        },
        body: JSON.stringify({ paused: false }),
      }),
    );

    const admit = await exports.default.fetch(
      new Request(`https://example.com/api/demo/${session.sessionId}/admit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tideguard-demo-controller": session.controllerToken,
        },
        body: "{}",
      }),
    );
    expect(admit.status).toBe(200);
    const admitted = await json<{ admitted: string[] }>(admit);
    expect(admitted.admitted).toContain(visitorB.visitorId);

    const statusB = await exports.default.fetch(
      new Request(
        `https://example.com/api/demo/${session.sessionId}/status?visitorId=${visitorB.visitorId}`,
        { headers: { cookie: cookieB } },
      ),
    );
    expect(statusB.status).toBe(200);
    const statusBody = await json<{ status: string; accessToken?: string }>(statusB);
    expect(statusBody.status).toBe("admitted");
    expect(statusBody.accessToken).toBeTruthy();

    const denied = await exports.default.fetch(
      new Request(`https://example.com/demo/live/protected?session=${session.sessionId}`),
    );
    expect(denied.status).toBe(401);

    const allowed = await exports.default.fetch(
      new Request(`https://example.com/demo/live/protected?session=${session.sessionId}`, {
        headers: { cookie: cookieFrom(statusB) || cookieB },
      }),
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toContain("Access granted");

    // Isolation: other session controller cannot admit.
    const other = await json<{ sessionId: string; controllerToken: string }>(
      await exports.default.fetch(
        new Request("https://example.com/api/demo/session", { method: "POST", body: "{}" }),
      ),
    );
    const cross = await exports.default.fetch(
      new Request(`https://example.com/api/demo/${session.sessionId}/admit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tideguard-demo-controller": other.controllerToken,
        },
        body: "{}",
      }),
    );
    expect(cross.status).toBe(401);

    const reset = await exports.default.fetch(
      new Request(`https://example.com/api/demo/${session.sessionId}/reset`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tideguard-demo-controller": session.controllerToken,
        },
        body: "{}",
      }),
    );
    expect(reset.status).toBe(200);
    const resetBody = await json<{ queue: string; generation: number }>(reset);
    expect(resetBody.generation).toBe(1);
    expect(resetBody.queue).toContain("-g1");

    // Old ticket/queue no longer valid for status after reset generation bump.
    const stale = await exports.default.fetch(
      new Request(
        `https://example.com/api/demo/${session.sessionId}/status?visitorId=${visitorA.visitorId}`,
        { headers: { cookie: cookieA } },
      ),
    );
    expect(stale.status).toBe(401);
  });

  it("rejects invalid session ids and serves the live demo page", async () => {
    const page = await exports.default.fetch(new Request("https://example.com/demo/live"));
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Live demo");
    expect(html).toContain("powered by a real TideGuard Worker");

    const bad = await exports.default.fetch(
      new Request("https://example.com/api/demo/not-a-session/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(bad.status).toBe(404);
  });

  it("updates admit rate within safe bounds and rejects out-of-range values", async () => {
    const session = await json<{ sessionId: string; controllerToken: string }>(
      await exports.default.fetch(
        new Request("https://example.com/api/demo/session", { method: "POST", body: "{}" }),
      ),
    );

    const ok = await exports.default.fetch(
      new Request(`https://example.com/api/demo/${session.sessionId}/rate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tideguard-demo-controller": session.controllerToken,
        },
        body: JSON.stringify({ admitPerSecond: 1.5 }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(await json<{ admitPerSecond: number }>(ok)).toEqual({
      sessionId: session.sessionId,
      admitPerSecond: 1.5,
    });

    const tooHigh = await exports.default.fetch(
      new Request(`https://example.com/api/demo/${session.sessionId}/rate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tideguard-demo-controller": session.controllerToken,
        },
        body: JSON.stringify({ admitPerSecond: 99 }),
      }),
    );
    expect(tooHigh.status).toBe(400);
  });

  it("rejects joins after the demo session expires", async () => {
    const created = await json<{ sessionId: string }>(
      await exports.default.fetch(
        new Request("https://example.com/api/demo/session", { method: "POST", body: "{}" }),
      ),
    );

    await env.CONFIG_KV.put(
      demoSessionKey(created.sessionId),
      JSON.stringify({
        sessionId: created.sessionId,
        createdAt: Date.now() - DEMO_LIMITS.sessionTtlSeconds * 1000 - 60_000,
        expiresAt: Date.now() - 1_000,
        generation: 0,
        admitPerSecond: DEMO_LIMITS.defaultAdmitPerSecond,
        paused: false,
        participantCount: 0,
      }),
      { expirationTtl: 60 },
    );

    const join = await exports.default.fetch(
      new Request(`https://example.com/api/demo/${created.sessionId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(join.status).toBe(401);
  });
});

function cookieFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length > 0) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  const single = response.headers.get("set-cookie");
  return single ? single.split(";")[0]! : "";
}
