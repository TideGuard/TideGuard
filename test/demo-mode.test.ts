import { describe, expect, it } from "vitest";
import { isDemoMode } from "../src/core/demo-mode";

describe("isDemoMode", () => {
  it("is true when origin proxy is disabled", () => {
    expect(isDemoMode({ enabled: false, protectAll: true, pathPrefixes: [] })).toBe(true);
  });

  it("is true when enabled but nothing is gated", () => {
    expect(isDemoMode({ enabled: true, protectAll: false, pathPrefixes: [] })).toBe(true);
  });

  it("is false when protect-all is on", () => {
    expect(isDemoMode({ enabled: true, protectAll: true, pathPrefixes: [] })).toBe(false);
  });

  it("is false when path prefixes gate traffic", () => {
    expect(isDemoMode({ enabled: true, protectAll: false, pathPrefixes: ["/checkout"] })).toBe(
      false,
    );
  });
});
