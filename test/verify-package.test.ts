import { describe, expect, it } from "vitest";
import {
  TokenError,
  buildAdmissionClaims,
  signAccessToken,
  verifyAccessToken,
} from "../packages/verify/index.js";

describe("@tideguard/verify extract", () => {
  it("signs and verifies admission claims", async () => {
    const secret = "package-test-secret";
    const claims = buildAdmissionClaims({
      visitorId: "visitor-1",
      queue: "default",
      tokenTTLSeconds: 60,
      nowMs: 1_000_000,
    });
    const token = await signAccessToken(claims, secret);

    await expect(
      verifyAccessToken(token, secret, { expectedQueue: "default", nowSeconds: 1_001 }),
    ).resolves.toEqual(claims);
  });

  it("rejects queue mismatches with TokenError", async () => {
    const claims = buildAdmissionClaims({
      visitorId: "visitor-1",
      queue: "default",
      tokenTTLSeconds: 60,
      nowMs: 1_000_000,
    });
    const token = await signAccessToken(claims, "secret");

    await expect(
      verifyAccessToken(token, "secret", { expectedQueue: "other", nowSeconds: 1_001 }),
    ).rejects.toBeInstanceOf(TokenError);
  });
});
