import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("HEAD and OpenAPI surfaces", () => {
  it("answers HEAD for HTML and health routes", async () => {
    for (const path of ["/", "/wait", "/admin", "/health", "/cost", "/openapi.yaml"]) {
      const response = await exports.default.fetch(
        new Request(`https://example.com${path}`, { method: "HEAD" }),
      );
      expect(response.status, path).toBe(200);
      expect(await response.text()).toBe("");
    }
  });

  it("serves OpenAPI YAML and JSON", async () => {
    const yaml = await exports.default.fetch(new Request("https://example.com/openapi.yaml"));
    expect(yaml.status).toBe(200);
    expect(yaml.headers.get("content-type")).toContain("yaml");
    expect(await yaml.text()).toContain("openapi:");

    const json = await exports.default.fetch(new Request("https://example.com/openapi.json"));
    expect(json.status).toBe(200);
    const body = await json.json<{ openapi: string; info: { title: string } }>();
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("TideGuard");
  });

  it("shows a clearer landing path", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/"));
    const html = await response.text();
    expect(html).toContain("How it works");
    expect(html).toContain("Live demo");
    expect(html).toContain("Public Beta");
    expect(html).toContain("/openapi.yaml");
  });
});
