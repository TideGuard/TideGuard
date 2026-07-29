import { describe, expect, it } from "vitest";
import { isCountryBlocked, parseCountryCodes } from "../src/auth/geo-country";
import {
  effectiveBlockedCountries,
  isGeoBlockActive,
  type GeoBlockSettings,
} from "../src/admin/geo-block-store";

describe("geo country codes", () => {
  it("parses ISO codes and rejects junk", () => {
    const ok = parseCountryCodes("cn\nRU, kp");
    expect(ok.errors).toEqual([]);
    expect(ok.countries).toEqual(["CN", "RU", "KP"]);

    const bad = parseCountryCodes("USA");
    expect(bad.errors[0]).toMatch(/Invalid/);
  });

  it("matches blocked countries", () => {
    expect(isCountryBlocked("CN", ["CN", "RU"])).toBe(true);
    expect(isCountryBlocked("US", ["CN", "RU"])).toBe(false);
    expect(isCountryBlocked(null, ["CN"])).toBe(false);
    expect(isCountryBlocked("XX", ["CN"])).toBe(false);
  });
});

describe("geo block TTL", () => {
  it("treats expired lists as inactive", () => {
    const settings: GeoBlockSettings = {
      enabled: true,
      countries: ["CN"],
      expiresAt: Date.now() - 1000,
      updatedAt: Date.now() - 10_000,
    };
    expect(isGeoBlockActive(settings)).toBe(false);
    expect(effectiveBlockedCountries(settings)).toEqual([]);
  });

  it("is active before expiry", () => {
    const settings: GeoBlockSettings = {
      enabled: true,
      countries: ["CN", "RU"],
      expiresAt: Date.now() + 60_000,
      updatedAt: Date.now(),
    };
    expect(isGeoBlockActive(settings)).toBe(true);
    expect(effectiveBlockedCountries(settings)).toEqual(["CN", "RU"]);
  });
});

describe("geo block stats public shape", () => {
  it("sorts countries by hits", async () => {
    const { toGeoBlockStatsPublic } = await import("../src/admin/geo-block-stats");
    const view = toGeoBlockStatsPublic({
      totalHits: 5,
      byCountry: { US: 1, CN: 3, RU: 1 },
      lastHitAt: 1,
      lastHitCountry: "CN",
      windowStartedAt: 1,
    });
    expect(view.byCountry[0]).toEqual({ country: "CN", hits: 3 });
    expect(view.totalHits).toBe(5);
  });
});
