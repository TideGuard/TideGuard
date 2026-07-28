import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password";
import { signAdminSession, verifyAdminSession } from "../src/auth/admin-session";
import { TokenError } from "../src/auth/token";

describe("admin password hashing", () => {
  it("verifies a matching password", async () => {
    const { hash, salt } = await hashPassword("tideguard-pass");
    expect(await verifyPassword("tideguard-pass", hash, salt)).toBe(true);
    expect(await verifyPassword("wrong-pass!!", hash, salt)).toBe(false);
  });
});

describe("admin session tokens", () => {
  const secret = "test-token-secret-do-not-use-in-production";

  it("signs and verifies a session", async () => {
    const token = await signAdminSession(secret, 60, 1_000);
    const claims = await verifyAdminSession(token, secret, 1_010);
    expect(claims.role).toBe("admin");
    expect(claims.exp).toBe(1_060);
  });

  it("rejects expired sessions", async () => {
    const token = await signAdminSession(secret, 10, 1_000);
    await expect(verifyAdminSession(token, secret, 1_020)).rejects.toBeInstanceOf(TokenError);
  });
});
