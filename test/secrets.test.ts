import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "../src/admin/secret-box";
import {
  adminSecret,
  openWithAdminSecret,
  openWithAdminSecretDetailed,
  sealWithAdminSecret,
  visitorSecret,
} from "../src/auth/secrets";
import { signAccessToken, verifyAccessToken, buildAdmissionClaims } from "../src/auth/token";
import { signAdminSession, verifyAdminSession } from "../src/auth/admin-session";

function mockEnv(overrides: Partial<Env> = {}): Env {
  return {
    TOKEN_SECRET: "visitor-token-secret-32bytes-min!!",
    CONFIG_KV: {} as KVNamespace,
    QUEUE_ROOM: {} as DurableObjectNamespace,
    ENVIRONMENT: "production",
    ...overrides,
  } as Env;
}

describe("ADMIN_SECRET split", () => {
  it("visitorSecret ignores ADMIN_SECRET", () => {
    const env = mockEnv({ ADMIN_SECRET: "admin-secret-value-32bytes-min!!!!" });
    expect(visitorSecret(env)).toBe(env.TOKEN_SECRET);
    expect(adminSecret(env)).toBe(env.ADMIN_SECRET);
  });

  it("adminSecret falls back to TOKEN_SECRET when unset", () => {
    const env = mockEnv();
    expect(adminSecret(env)).toBe(env.TOKEN_SECRET);
  });

  it("seals with admin secret and opens with TOKEN_SECRET fallback", async () => {
    const tokenOnly = mockEnv();
    const sealed = await sealSecret("cf-api-token-value", tokenOnly.TOKEN_SECRET);

    const withAdmin = mockEnv({ ADMIN_SECRET: "admin-secret-value-32bytes-min!!!!" });
    const opened = await openWithAdminSecretDetailed(withAdmin, sealed);
    expect(opened.plaintext).toBe("cf-api-token-value");
    expect(opened.usedTokenSecretFallback).toBe(true);

    const resealed = await sealWithAdminSecret(withAdmin, "new-secret");
    const after = await openWithAdminSecretDetailed(withAdmin, resealed);
    expect(after.plaintext).toBe("new-secret");
    expect(after.usedTokenSecretFallback).toBe(false);
    await expect(openSecret(resealed, withAdmin.TOKEN_SECRET)).rejects.toThrow();
    expect(await openWithAdminSecret(withAdmin, resealed)).toBe("new-secret");
  });

  it("re-seals webhook secret after TOKEN_SECRET fallback", async () => {
    const { openWebhookSecret, writeWebhookSettings, readWebhookSettings } =
      await import("../src/admin/webhook-store");
    const store = new Map<string, string>();
    const kv = {
      get: async (key: string, type?: string) => {
        const raw = store.get(key);
        if (!raw) return null;
        return type === "json" ? JSON.parse(raw) : raw;
      },
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
    } as unknown as KVNamespace;
    const tokenOnly = mockEnv({ CONFIG_KV: kv });

    const sealedWithToken = await sealSecret("hook-secret", tokenOnly.TOKEN_SECRET);
    await writeWebhookSettings(tokenOnly, {
      enabled: false,
      url: "https://hooks.example.com/tg",
      events: ["pause"],
      depthThreshold: 10,
      sealedSecret: sealedWithToken,
      updatedAt: 1,
    });

    const withAdmin = mockEnv({
      CONFIG_KV: kv,
      ADMIN_SECRET: "admin-secret-value-32bytes-min!!!!",
    });
    expect(await openWebhookSecret(withAdmin, sealedWithToken)).toBe("hook-secret");
    const migrated = await readWebhookSettings(withAdmin);
    expect(migrated.sealedSecret).toBeTruthy();
    expect(migrated.sealedSecret).not.toBe(sealedWithToken);
    await expect(openSecret(migrated.sealedSecret!, withAdmin.TOKEN_SECRET)).rejects.toThrow();
    expect(await openWebhookSecret(withAdmin, migrated.sealedSecret!)).toBe("hook-secret");
  });

  it("keeps visitor tokens on TOKEN_SECRET when ADMIN_SECRET is set", async () => {
    const env = mockEnv({ ADMIN_SECRET: "admin-secret-value-32bytes-min!!!!" });
    const token = await signAccessToken(
      buildAdmissionClaims({
        visitorId: "v1",
        queue: "default",
        tokenTTLSeconds: 60,
      }),
      visitorSecret(env),
    );
    const claims = await verifyAccessToken(token, visitorSecret(env));
    expect(claims.sub).toBe("v1");
    await expect(verifyAccessToken(token, adminSecret(env))).rejects.toThrow();
  });

  it("signs admin sessions with adminSecret", async () => {
    const env = mockEnv({ ADMIN_SECRET: "admin-secret-value-32bytes-min!!!!" });
    const cookieVal = await signAdminSession(adminSecret(env), {
      id: "u1",
      username: "ops",
    });
    const claims = await verifyAdminSession(cookieVal, adminSecret(env));
    expect(claims.username).toBe("ops");
    await expect(verifyAdminSession(cookieVal, visitorSecret(env))).rejects.toThrow();
  });
});
