import { describe, expect, it } from "vitest";
import { ipMatchesAllowlist, parseAllowlistText, parseCidr } from "../src/auth/ip-allowlist";
import { openSecret, sealSecret } from "../src/admin/secret-box";

describe("ip allowlist", () => {
  it("matches exact IPv4 and CIDR ranges", () => {
    expect(ipMatchesAllowlist("203.0.113.10", ["203.0.113.10"])).toBe(true);
    expect(ipMatchesAllowlist("203.0.113.11", ["203.0.113.10"])).toBe(false);
    expect(ipMatchesAllowlist("203.0.113.50", ["203.0.113.0/24"])).toBe(true);
    expect(ipMatchesAllowlist("203.0.114.1", ["203.0.113.0/24"])).toBe(false);
  });

  it("matches IPv6 CIDRs", () => {
    expect(ipMatchesAllowlist("2001:db8::1", ["2001:db8::/32"])).toBe(true);
    expect(ipMatchesAllowlist("2001:db9::1", ["2001:db8::/32"])).toBe(false);
  });

  it("parses allowlist text and rejects junk", () => {
    const ok = parseAllowlistText("203.0.113.0/24\n# office\n2001:db8::/64");
    expect(ok.errors).toEqual([]);
    expect(ok.entries[0]).toBe("203.0.113.0/24");
    expect(ipMatchesAllowlist("2001:db8::1", ok.entries)).toBe(true);

    const bad = parseAllowlistText("not-an-ip");
    expect(bad.errors[0]).toMatch(/Invalid/);
  });

  it("normalizes bare IPs to themselves", () => {
    expect(parseCidr("8.8.8.8")?.raw).toBe("8.8.8.8");
    expect(parseCidr("8.8.8.8/32")?.raw).toBe("8.8.8.8/32");
  });
});

describe("secret-box", () => {
  it("round-trips sealed secrets (default v2)", async () => {
    const sealed = await sealSecret("cf-api-token-value", "test-token-secret-16");
    expect(sealed.startsWith("v2.")).toBe(true);
    expect(await openSecret(sealed, "test-token-secret-16")).toBe("cf-api-token-value");
  });

  it("round-trips legacy v1 sealed secrets", async () => {
    const sealed = await sealSecret("cf-api-token-value", "test-token-secret-16", "v1");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(await openSecret(sealed, "test-token-secret-16")).toBe("cf-api-token-value");
  });
});
