import { describe, expect, it, vi } from "vitest";
import {
  advanceHealthState,
  DEFAULT_HEALTH_CONFIG,
  DEFAULT_HEALTH_STATE,
  defaultHealthUrlFromOrigin,
  healthRateMultiplier,
  isAutoPaused,
  parseHealthConfig,
  probeOriginHealth,
  sanitizeHealthUrl,
} from "../src/health/origin-probe";

describe("origin health probe helpers", () => {
  it("rejects private health URLs", () => {
    expect(sanitizeHealthUrl("http://127.0.0.1/health")).toBeNull();
    expect(sanitizeHealthUrl("https://origin.example.com/health")).toBe(
      "https://origin.example.com/health",
    );
    expect(sanitizeHealthUrl("ftp://example.com/x")).toBeNull();
    expect(sanitizeHealthUrl("")).toBeNull();
    expect(defaultHealthUrlFromOrigin("https://shop.example.com")).toBe(
      "https://shop.example.com/health",
    );
    expect(defaultHealthUrlFromOrigin("not-a-url")).toBeNull();
  });

  it("probes origin health success, bad status, and fetch errors", async () => {
    const config = parseHealthConfig({
      enabled: true,
      url: "https://origin.example.com/health",
      timeoutMs: 1_000,
      maxLatencyMs: 30_000,
      expectStatus: 200,
    });
    expect(
      await probeOriginHealth({ ...config, url: null }, async () => new Response("x")),
    ).toMatchObject({ ok: false, error: "Health URL not configured" });

    const okFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const ok = await probeOriginHealth(config, okFetch as unknown as typeof fetch);
    expect(ok.ok).toBe(true);
    expect(ok.status).toBe(200);

    const bad = await probeOriginHealth(
      config,
      vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch,
    );
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("Unexpected status");

    const boom = await probeOriginHealth(
      config,
      vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    );
    expect(boom.ok).toBe(false);
    expect(boom.error).toBe("network down");

    const slowConfig = parseHealthConfig({
      ...config,
      maxLatencyMs: 100,
    });
    const slow = await probeOriginHealth(slowConfig, async () => {
      await new Promise((r) => setTimeout(r, 120));
      return new Response("ok", { status: 200 });
    });
    expect(slow.ok).toBe(false);
    expect(slow.error).toContain("Latency");
  });

  it("isAutoPaused when health level is pause", () => {
    const config = parseHealthConfig({
      enabled: true,
      url: "https://origin.example.com/health",
    });
    const paused = { ...DEFAULT_HEALTH_STATE, level: "pause" as const };
    expect(isAutoPaused(config, paused, Date.now())).toBe(true);
    expect(isAutoPaused({ ...config, enabled: false }, paused, Date.now())).toBe(false);
  });

  it("advances ok → slow → pause and recovers", () => {
    const config = parseHealthConfig({
      ...DEFAULT_HEALTH_CONFIG,
      enabled: true,
      url: "https://origin.example.com/health",
      failThreshold: 2,
      recoverThreshold: 2,
    });
    let state = { ...DEFAULT_HEALTH_STATE };
    state = advanceHealthState(
      config,
      state,
      { ok: false, latencyMs: 10, status: 500, error: "x" },
      1,
    );
    expect(state.level).toBe("ok");
    state = advanceHealthState(
      config,
      state,
      { ok: false, latencyMs: 10, status: 500, error: "x" },
      2,
    );
    expect(state.level).toBe("slow");
    expect(healthRateMultiplier(config, state, 2)).toBe(config.slowRateMultiplier);
    state = advanceHealthState(
      config,
      state,
      { ok: false, latencyMs: 10, status: 500, error: "x" },
      3,
    );
    state = advanceHealthState(
      config,
      state,
      { ok: false, latencyMs: 10, status: 500, error: "x" },
      4,
    );
    expect(state.level).toBe("pause");
    expect(healthRateMultiplier(config, state, 4)).toBe(0);
    state = advanceHealthState(
      config,
      state,
      { ok: true, latencyMs: 10, status: 200, error: null },
      5,
    );
    state = advanceHealthState(
      config,
      state,
      { ok: true, latencyMs: 10, status: 200, error: null },
      6,
    );
    expect(state.level).toBe("ok");
  });

  it("overrideUntil forces multiplier 1", () => {
    const config = parseHealthConfig({
      enabled: true,
      url: "https://origin.example.com/health",
      overrideUntil: Date.now() + 60_000,
      slowRateMultiplier: 0.25,
    });
    const state = { ...DEFAULT_HEALTH_STATE, level: "pause" as const };
    expect(healthRateMultiplier(config, state, Date.now())).toBe(1);
  });
});
