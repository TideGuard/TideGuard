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
      estimate: {
        totalUsd: number;
        workerRequests: number;
        dominantCost: string;
        pollingMode: string;
        heartbeatsPerVisitor: number;
      };
    }>();
    expect(body.estimate.pollingMode).toBe("adaptive");
    expect(body.estimate.heartbeatsPerVisitor).toBe(0);
    expect(body.estimate.workerRequests).toBeLessThan(465_000_000);
    expect(body.estimate.totalUsd).toBeGreaterThan(20);
    expect(body.estimate.totalUsd).toBeLessThan(200);
  });

  it("supports fixed polling mode for comparison", async () => {
    const response = await exports.default.fetch(
      new Request(
        "https://example.com/api/cost-estimate?visitors=5000000&averageWaitSeconds=900&pollingMode=fixed&pollIntervalSeconds=15&heartbeatIntervalSeconds=30",
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      estimate: { pollingMode: string; workerRequests: number };
    }>();
    expect(body.estimate.pollingMode).toBe("fixed");
    expect(body.estimate.workerRequests).toBe(465_000_000);
  });

  it("links the calculator from the landing page", async () => {
    const { resetAdmin, setupAdmin } = await import("./helpers/admin-setup");
    await resetAdmin();
    await setupAdmin();

    const response = await exports.default.fetch(new Request("https://example.com/"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('href="/cost"');
  });
});
