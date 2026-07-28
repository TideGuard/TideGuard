import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("waiting room and demo flow", () => {
  it("serves the waiting room HTML", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/wait?queue=flow-demo&return=/demo"),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("TideGuard");
    expect(html).toContain("You’re in line");
    expect(html).toContain("/join");
    expect(html).not.toContain("In queue");
  });

  it("can show waiting count when showWaiting=1", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/wait?queue=flow-demo&showWaiting=1"),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("In pool");
    expect(html).toContain("Behind");
    expect(html).toContain("showWaitingCount = true");
  });

  it("redirects unauthenticated demo visitors to the waiting room", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/demo?queue=flow-demo", { redirect: "manual" }),
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toContain("/wait");
    expect(location).toContain("queue=flow-demo");
  });

  it("allows access to the demo with a valid admission token cookie", async () => {
    const join = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "flow-granted", visitorId: "demo-user" }),
      }),
    );
    const body = await join.json<{ accessToken?: string; status: string }>();
    expect(body.status).toBe("admitted");
    expect(body.accessToken).toBeTypeOf("string");

    const demo = await exports.default.fetch(
      new Request("https://example.com/demo?queue=flow-granted", {
        headers: {
          cookie: `tg_access=${encodeURIComponent(body.accessToken!)}`,
        },
      }),
    );
    expect(demo.status).toBe(200);
    const html = await demo.text();
    expect(html).toContain("Access granted");
    expect(html).toContain("demo-user");
  });
});
