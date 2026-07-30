import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version";

describe("GET /health", () => {
  it("returns service health metadata", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/health"));
    expect(response.status).toBe(200);

    const body = await response.json<{
      status: string;
      service: string;
      version: string;
      environment: string;
      time: string;
    }>();

    expect(body.status).toBe("ok");
    expect(body.service).toBe("tideguard");
    expect(body.version).toBe(VERSION);
    expect(body.environment).toBe(env.ENVIRONMENT);
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });
});

describe("GET /", () => {
  it("redirects to /admin when setup is incomplete", async () => {
    await exports.default.fetch(
      new Request("https://example.com/api/admin/reset", {
        method: "POST",
        headers: { authorization: "Bearer test-token-secret-do-not-use-in-production" },
      }),
    );
    const response = await exports.default.fetch(
      new Request("https://example.com/", { redirect: "manual" }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/admin");
  });
});

describe("unknown routes", () => {
  it("returns a typed 404 payload", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/missing"));
    expect(response.status).toBe(404);

    const body = await response.json<{
      error: { code: string; message: string };
    }>();

    expect(body.error.code).toBe("not_found");
  });
});

describe("QueueRoom Durable Object", () => {
  it("responds to ping over RPC", async () => {
    const stub = env.QUEUE_ROOM.getByName("default");
    const result = await stub.ping();
    expect(result.ok).toBe(true);
    expect(typeof result.queue).toBe("string");
  });
});
