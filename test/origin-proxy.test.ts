import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const SECRET = "test-token-secret-do-not-use-in-production";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function cookieFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length > 0) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  const single = response.headers.get("set-cookie");
  return single ? single.split(";")[0]! : "";
}

describe("origin proxy gate", () => {
  it("redirects protected paths to /wait when origin proxy is enabled", async () => {
    await exports.default.fetch(
      new Request("https://example.com/api/admin/reset", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

    const setup = await exports.default.fetch(
      new Request("https://example.com/api/admin/setup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({
          password: "origin-proxy-pass",
          confirmPassword: "origin-proxy-pass",
          queue: "default",
          admissionMode: "queue",
        }),
      }),
    );
    expect(setup.status).toBe(200);
    const session = cookieFrom(setup);

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

    // Control plane still works without admission.
    const health = await exports.default.fetch(new Request("https://example.com/health"));
    expect(health.status).toBe(200);
  });
});
