/**
 * Secret-split security: specialised secrets must not cross trust boundaries.
 * Uses clearly distinct values so fallback vs dedicated behaviour is proven.
 */
import { env, exports } from "cloudflare:workers";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildAdmissionClaims,
  signAccessToken,
  verifyAccessToken,
  signAdminSession,
  verifyAdminSession,
  TokenError,
} from "../src/auth";
import {
  requireAdmissionSecret,
  requireAdminSessionSecret,
  requireOperatorSecret,
  requireSealSecret,
} from "../src/auth/secrets";
import {
  openCredential,
  openCredentialWithMigration,
  sealCredential,
  sealSecret,
  sealedVersion,
} from "../src/admin/secret-box";
import { BYPASS_SETTINGS_KEY, readCloudflareApiToken } from "../src/admin/bypass-store";
import { TOS_VERSION } from "../src/admin/tos";

const CURRENT_TOS_VERSION = TOS_VERSION;

const OPERATOR = "operator-secret-aaaa-do-not-reuse-elsewhere";
const ADMISSION = "admission-secret-bbbb-do-not-reuse-elsewhere";
const ADMIN_SESSION = "admin-session-secret-cccc-do-not-reuse";
const SEAL = "seal-secret-dddd-do-not-reuse-elsewhere-xx";

const ORIGINAL_TOKEN = env.TOKEN_SECRET;

function asMutableEnv(): Record<string, string | undefined> {
  return env as unknown as Record<string, string | undefined>;
}

function applySplitSecrets(): void {
  const e = asMutableEnv();
  e.TOKEN_SECRET = OPERATOR;
  e.ADMISSION_SECRET = ADMISSION;
  e.ADMIN_SESSION_SECRET = ADMIN_SESSION;
  e.SEAL_SECRET = SEAL;
}

function applyLegacySecrets(): void {
  const e = asMutableEnv();
  e.TOKEN_SECRET = OPERATOR;
  delete e.ADMISSION_SECRET;
  delete e.ADMIN_SESSION_SECRET;
  delete e.SEAL_SECRET;
}

function restoreEnv(): void {
  const e = asMutableEnv();
  e.TOKEN_SECRET = ORIGINAL_TOKEN;
  delete e.ADMISSION_SECRET;
  delete e.ADMIN_SESSION_SECRET;
  delete e.SEAL_SECRET;
}

afterEach(() => {
  restoreEnv();
});

describe("secret resolvers", () => {
  it("falls back specialised secrets to TOKEN_SECRET when unset", () => {
    applyLegacySecrets();
    expect(requireOperatorSecret(env)).toBe(OPERATOR);
    expect(requireAdmissionSecret(env)).toBe(OPERATOR);
    expect(requireAdminSessionSecret(env)).toBe(OPERATOR);
    expect(requireSealSecret(env)).toBe(OPERATOR);
  });

  it("uses dedicated secrets when configured", () => {
    applySplitSecrets();
    expect(requireOperatorSecret(env)).toBe(OPERATOR);
    expect(requireAdmissionSecret(env)).toBe(ADMISSION);
    expect(requireAdminSessionSecret(env)).toBe(ADMIN_SESSION);
    expect(requireSealSecret(env)).toBe(SEAL);
  });
});

describe("admission secret separation", () => {
  it("accepts an admission token signed with ADMISSION_SECRET", async () => {
    applySplitSecrets();
    const token = await signAccessToken(
      buildAdmissionClaims({
        visitorId: "v1",
        queue: "default",
        tokenTTLSeconds: 600,
        nowSeconds: 1_000,
      }),
      requireAdmissionSecret(env),
    );
    await expect(
      verifyAccessToken(token, requireAdmissionSecret(env), { nowSeconds: 1_001 }),
    ).resolves.toMatchObject({ sub: "v1", queue: "default" });
  });

  it("rejects a token signed with TOKEN_SECRET when ADMISSION_SECRET is active", async () => {
    applySplitSecrets();
    const token = await signAccessToken(
      buildAdmissionClaims({
        visitorId: "v1",
        queue: "default",
        tokenTTLSeconds: 600,
        nowSeconds: 1_000,
      }),
      requireOperatorSecret(env),
    );
    await expect(
      verifyAccessToken(token, requireAdmissionSecret(env), { nowSeconds: 1_001 }),
    ).rejects.toBeInstanceOf(TokenError);
  });

  it("ADMISSION_SECRET cannot authenticate an operator Bearer request", async () => {
    applySplitSecrets();
    await env.CONFIG_KV.delete("admin:config");
    const response = await exports.default.fetch(
      new Request("https://example.com/metrics?queue=default", {
        headers: { Authorization: `Bearer ${ADMISSION}` },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("ADMISSION_SECRET cannot perform a factory reset", async () => {
    applySplitSecrets();
    const response = await exports.default.fetch(
      new Request("https://example.com/api/admin/reset", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ADMISSION}`,
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe("admin session secret separation", () => {
  it("accepts a session signed with ADMIN_SESSION_SECRET", async () => {
    applySplitSecrets();
    const token = await signAdminSession(
      requireAdminSessionSecret(env),
      { id: "u1", username: "alice" },
      60,
      1_000,
    );
    await expect(
      verifyAdminSession(token, requireAdminSessionSecret(env), 1_010),
    ).resolves.toMatchObject({
      sub: "u1",
      username: "alice",
    });
  });

  it("rejects a session signed with ADMISSION_SECRET", async () => {
    applySplitSecrets();
    const token = await signAdminSession(
      requireAdmissionSecret(env),
      { id: "u1", username: "alice" },
      60,
      1_000,
    );
    await expect(
      verifyAdminSession(token, requireAdminSessionSecret(env), 1_010),
    ).rejects.toBeInstanceOf(TokenError);
  });

  it("rejects a session signed with TOKEN_SECRET when ADMIN_SESSION_SECRET is active", async () => {
    applySplitSecrets();
    const token = await signAdminSession(
      requireOperatorSecret(env),
      { id: "u1", username: "alice" },
      60,
      1_000,
    );
    await expect(
      verifyAdminSession(token, requireAdminSessionSecret(env), 1_010),
    ).rejects.toBeInstanceOf(TokenError);
  });

  it("ADMIN_SESSION_SECRET cannot be used as Bearer operator authentication", async () => {
    applySplitSecrets();
    const response = await exports.default.fetch(
      new Request("https://example.com/metrics?queue=default", {
        headers: { Authorization: `Bearer ${ADMIN_SESSION}` },
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe("TOKEN_SECRET-only backward compatibility", () => {
  beforeEach(async () => {
    applyLegacySecrets();
    await env.CONFIG_KV.delete("admin:config");
    await env.CONFIG_KV.delete("admin:setup-pending");
  });

  it("still claims and signs with TOKEN_SECRET alone", async () => {
    const claim = await exports.default.fetch(
      new Request("https://example.com/api/admin/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPERATOR}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: "solo",
          password: "CorrectHorseBattery1!",
          acceptedTosVersion: CURRENT_TOS_VERSION,
        }),
      }),
    );
    expect(claim.status).toBe(200);

    const token = await signAccessToken(
      buildAdmissionClaims({
        visitorId: "legacy",
        queue: "default",
        tokenTTLSeconds: 600,
        nowSeconds: 1_000,
      }),
      requireAdmissionSecret(env),
    );
    await expect(verifyAccessToken(token, OPERATOR, { nowSeconds: 1_001 })).resolves.toMatchObject({
      sub: "legacy",
    });
  });

  it("TOKEN_SECRET Bearer still reaches operator routes", async () => {
    const response = await exports.default.fetch(
      new Request("https://example.com/metrics?queue=default", {
        headers: { Authorization: `Bearer ${OPERATOR}` },
      }),
    );
    expect(response.status).toBe(200);
  });
});

describe("seal secret migration", () => {
  it("new credentials use SEAL_SECRET (v2) when dedicated", async () => {
    applySplitSecrets();
    const sealed = await sealCredential(env, "cf-api-token-value-long-enough");
    expect(sealedVersion(sealed)).toBe("v2");
    expect(await openCredential(env, sealed)).toBe("cf-api-token-value-long-enough");
  });

  it("legacy v1 values sealed with TOKEN_SECRET remain readable", async () => {
    applySplitSecrets();
    const legacy = await sealSecret("legacy-cf-token-value-xx", OPERATOR, "v1");
    expect(sealedVersion(legacy)).toBe("v1");
    expect(await openCredential(env, legacy)).toBe("legacy-cf-token-value-xx");
  });

  it("migrates v1 → v2 after successful open when SEAL_SECRET is dedicated", async () => {
    applySplitSecrets();
    const legacy = await sealSecret("migrate-me-token-value", OPERATOR, "v1");
    const { plaintext, resealed } = await openCredentialWithMigration(env, legacy);
    expect(plaintext).toBe("migrate-me-token-value");
    expect(resealed).toBeTruthy();
    expect(sealedVersion(resealed!)).toBe("v2");
    expect(await openCredential(env, resealed!)).toBe("migrate-me-token-value");
  });

  it("TOKEN_SECRET-only deploys still write v1 and read it", async () => {
    applyLegacySecrets();
    const sealed = await sealCredential(env, "solo-token-secret-value");
    expect(sealedVersion(sealed)).toBe("v1");
    expect(await openCredential(env, sealed)).toBe("solo-token-secret-value");
  });

  it("failed decryption does not erase the stored sealed value", async () => {
    applySplitSecrets();
    const sealed = await sealCredential(env, "keep-me-around-please");
    await env.CONFIG_KV.put(
      BYPASS_SETTINGS_KEY,
      JSON.stringify({
        allowlist: [],
        zoneId: null,
        hostname: null,
        apiTokenSealed: sealed,
        accountId: null,
        workerService: "tideguard",
      }),
    );

    asMutableEnv().SEAL_SECRET = "wrong-seal-secret-eeee-do-not-match";
    expect(await readCloudflareApiToken(env)).toBeNull();

    const raw = await env.CONFIG_KV.get(BYPASS_SETTINGS_KEY, "json");
    expect(raw).toMatchObject({ apiTokenSealed: sealed });
  });
});
