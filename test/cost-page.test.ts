import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("cost calculator surfaces", () => {
  it("serves the calculate cost page", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/cost"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Calculate cost");
    expect(html).toContain("visitors");
    expect(html).toContain("Estimated queue load");
    expect(html).toContain("Peak concurrently waiting");
    expect(html).toContain("planning aids");
    expect(html).toContain("Public Beta");
  });

  it("returns JSON estimates from the API", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/api/cost-estimate?visitors=5000000&averageWaitSeconds=900"),
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      estimate: { totalUsd: number; workerRequests: number; dominantCost: string };
      queueLoad: { riskLevel: string; estimatedPeakRps: number; architecture: string };
      disclaimer: string;
    }>();
    expect(body.estimate.workerRequests).toBe(465_000_000);
    expect(body.estimate.totalUsd).toBeGreaterThan(150);
    expect(body.estimate.totalUsd).toBeLessThan(350);
    expect(body.estimate.dominantCost).toBe("polling");
    expect(body.queueLoad.architecture).toBe("single_durable_object");
    expect(body.queueLoad.estimatedPeakRps).toBeGreaterThan(0);
    expect(["low", "elevated", "high"]).toContain(body.queueLoad.riskLevel);
    expect(body.disclaimer).toContain("planning aids");
  });

  it("links the calculator from the landing page", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/"));
    const html = await response.text();
    expect(html).toContain('href="/cost"');
  });
});
