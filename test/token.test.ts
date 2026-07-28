import { describe, expect, it } from "vitest";
import { buildAdmissionClaims, signAccessToken, verifyAccessToken, TokenError } from "../src/auth";

const SECRET = "test-token-secret-do-not-use-in-production";

describe("access tokens", () => {
  it("signs and verifies a valid token", async () => {
    const claims = buildAdmissionClaims({
      visitorId: "visitor-1",
      queue: "launch",
      tokenTTLSeconds: 600,
      nowMs: 1_700_000_000_000,
    });

    const token = await signAccessToken(claims, SECRET);
    const verified = await verifyAccessToken(token, SECRET, {
      nowSeconds: Math.floor(1_700_000_000_000 / 1000),
      expectedQueue: "launch",
    });

    expect(verified).toEqual(claims);
  });

  it("rejects tampered tokens", async () => {
    const token = await signAccessToken(
      buildAdmissionClaims({
        visitorId: "visitor-1",
        queue: "launch",
        tokenTTLSeconds: 600,
      }),
      SECRET,
    );

    const [payload] = token.split(".");
    await expect(verifyAccessToken(`${payload}.deadbeef`, SECRET)).rejects.toBeInstanceOf(
      TokenError,
    );
  });

  it("rejects expired tokens", async () => {
    const claims = buildAdmissionClaims({
      visitorId: "visitor-1",
      queue: "launch",
      tokenTTLSeconds: 1,
      nowMs: 1_000_000,
    });
    const token = await signAccessToken(claims, SECRET);

    await expect(
      verifyAccessToken(token, SECRET, { nowSeconds: Math.floor(1_000_000 / 1000) + 2 }),
    ).rejects.toMatchObject({ code: "expired_token" });
  });

  it("rejects queue mismatches", async () => {
    const token = await signAccessToken(
      buildAdmissionClaims({
        visitorId: "visitor-1",
        queue: "launch",
        tokenTTLSeconds: 600,
      }),
      SECRET,
    );

    await expect(
      verifyAccessToken(token, SECRET, { expectedQueue: "other" }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });
});
