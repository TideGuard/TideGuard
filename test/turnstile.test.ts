import { describe, expect, it } from "vitest";
import {
  TURNSTILE_TEST_PASS_SECRET,
  verifyTurnstileToken,
} from "../src/admin/cloudflare-api";
import { env } from "cloudflare:workers";
import {
  isSetupPendingReady,
  seedSetupPendingForTests,
  clearSetupPending,
} from "../src/admin/setup-pending-store";

describe("Turnstile siteverify", () => {
  it("accepts the Cloudflare always-pass test secret offline", async () => {
    const result = await verifyTurnstileToken({
      secret: TURNSTILE_TEST_PASS_SECRET,
      token: "any-token",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty tokens", async () => {
    const result = await verifyTurnstileToken({
      secret: TURNSTILE_TEST_PASS_SECRET,
      token: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("setup pending", () => {
  it("seeds a ready pending blob for tests", async () => {
    await clearSetupPending(env);
    const pending = await seedSetupPendingForTests(env);
    expect(isSetupPendingReady(pending)).toBe(true);
    expect(pending.cloudflare?.proxyOk).toBe(true);
    expect(pending.turnstile?.verifiedAt).toBeGreaterThan(0);
  });
});
