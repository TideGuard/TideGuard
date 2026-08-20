import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("before you deploy roadmap", () => {
  it("serves the visual roadmap page", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/before-you-deploy"),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Before you deploy");
    expect(html).toContain("Generate a secret");
    expect(html).toContain("Launch checklist");
    expect(html).toContain('href="/before-you-deploy/download"');
    expect(html).toContain("Deploy to Cloudflare");
  });

  it("serves downloadable standalone HTML", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/before-you-deploy/download"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "tideguard-before-you-deploy.html",
    );
    const html = await response.text();
    expect(html).toContain("Before you deploy");
    expect(html).toContain("window.print");
  });

  it("links the roadmap from the landing page", async () => {
    const { resetAdmin, setupAdmin } = await import("./helpers/admin-setup");
    await resetAdmin();
    await setupAdmin();

    const response = await exports.default.fetch(new Request("https://example.com/"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('href="/before-you-deploy"');
  });
});
