import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { resetAdmin, setupAdmin } from "./helpers/admin-setup";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("origin proxy gate", () => {
  it("redirects protected paths to /wait when origin proxy is enabled", async () => {
    await resetAdmin();
    const session = await setupAdmin("ops", "origin-proxy-pass");

    const saved = await exports.default.fetch(
      new Request("https://example.com/api/admin/origin", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: session,
        },
        body: JSON.stringify({
          enabled: true,
          originUrl: "https://origin.example.com",
          protectAll: true,
          pathPrefixes: "",
          queue: "default",
        }),
      }),
    );
    expect(saved.status).toBe(200);
    const savedBody = await json<{ origin: { enabled: boolean; originUrl: string | null } }>(saved);
    expect(savedBody.origin.enabled).toBe(true);
    expect(savedBody.origin.originUrl).toBe("https://origin.example.com");

    const blocked = await exports.default.fetch(
      new Request("https://example.com/checkout", { redirect: "manual" }),
    );
    expect(blocked.status).toBe(302);
    const location = blocked.headers.get("location") ?? "";
    expect(location).toContain("/wait");
    expect(location).toContain("return=%2Fcheckout");

    const health = await exports.default.fetch(new Request("https://example.com/health"));
    expect(health.status).toBe(200);
  });
});
