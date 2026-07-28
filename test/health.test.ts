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
  it("serves the landing page", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("TideGuard");
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
