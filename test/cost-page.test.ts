import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("cost calculator surfaces", () => {
  it("serves the calculate cost page", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/cost"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Calculate cost");
    expect(html).toContain("visitors");
  });

  it("returns JSON estimates from the API", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/api/cost-estimate?visitors=5000000&averageWaitSeconds=900"),
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      estimate: { totalUsd: number; workerRequests: number; dominantCost: string };
    }>();
    expect(body.estimate.workerRequests).toBe(465_000_000);
    expect(body.estimate.totalUsd).toBeGreaterThan(150);
    expect(body.estimate.totalUsd).toBeLessThan(350);
    expect(body.estimate.dominantCost).toBe("polling");
  });

  it("links the calculator from the landing page", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/"));
    const html = await response.text();
    expect(html).toContain('href="/cost"');
  });
});
