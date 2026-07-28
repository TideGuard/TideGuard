import { describe, expect, it } from "vitest";
import {
  advanceHealthState,
  DEFAULT_HEALTH_CONFIG,
  DEFAULT_HEALTH_STATE,
  healthRateMultiplier,
  parseHealthConfig,
  sanitizeHealthUrl,
} from "../src/health/origin-probe";

describe("origin health probe helpers", () => {
  it("rejects private health URLs", () => {
    expect(sanitizeHealthUrl("http://127.0.0.1/health")).toBeNull();
    expect(sanitizeHealthUrl("https://origin.example.com/health")).toBe(
      "https://origin.example.com/health",
    );
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
