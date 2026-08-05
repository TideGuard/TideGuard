import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  ADMIN_PASSWORD,
  ADMIN_SECRET,
  claimAdmin,
  resetAdmin,
  setupAdmin,
  turnstileBody,
} from "./helpers/admin-setup";
import { ADMIN_CONFIG_KEY } from "../src/admin/types";
import { TOS_VERSION } from "../src/admin/tos";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("admin Terms of Service", () => {
  it("exposes tos fields on bootstrap", async () => {
    await resetAdmin();
    const boot = await exports.default.fetch(
      new Request("https://example.com/api/admin/bootstrap"),
    );
    expect(boot.status).toBe(200);
    const body = await json<{
      tosVersion: number;
      tosSummary: string;
      tosUrl: string;
      acceptedTosVersion: number | null;
    }>(boot);
    expect(body.tosVersion).toBe(TOS_VERSION);
    expect(body.tosSummary.length).toBeGreaterThan(20);
    expect(body.tosUrl).toContain("TERMS.md");
    expect(body.acceptedTosVersion).toBeNull();
  });

  it("rejects claim without acceptedTosVersion", async () => {
    await resetAdmin();
    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ADMIN_SECRET}`,
        },
        body: JSON.stringify({
          username: "ops",
          password: ADMIN_PASSWORD,
          confirmPassword: ADMIN_PASSWORD,
          queue: "default",
        }),
      }),
    );
    expect(denied.status).toBe(400);
    const body = await json<{ error?: { code?: string; details?: { tosVersion?: number } } }>(
      denied,
    );
    expect(body.error?.code).toBe("bad_request");
    expect(body.error?.details?.tosVersion).toBe(TOS_VERSION);
  });

  it("rejects claim with wrong acceptedTosVersion", async () => {
    await resetAdmin();
    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ADMIN_SECRET}`,
        },
        body: JSON.stringify({
          username: "ops",
          password: ADMIN_PASSWORD,
          confirmPassword: ADMIN_PASSWORD,
          queue: "default",
          acceptedTosVersion: 0,
        }),
      }),
    );
    expect(denied.status).toBe(400);
  });

  it("stamps acceptedTosVersion on claim and reports it on bootstrap", async () => {
    await resetAdmin();
    const cookie = await claimAdmin();
    const boot = await exports.default.fetch(
      new Request("https://example.com/api/admin/bootstrap", {
        headers: { cookie },
      }),
    );
    const body = await json<{ acceptedTosVersion: number | null; tosVersion: number }>(boot);
    expect(body.acceptedTosVersion).toBe(TOS_VERSION);
    expect(body.tosVersion).toBe(TOS_VERSION);
  });

  it("blocks session APIs when ToS is stale and accepts via /tos/accept", async () => {
    await resetAdmin();
    const cookie = await setupAdmin();

    const raw = (await env.CONFIG_KV.get(ADMIN_CONFIG_KEY, "json")) as {
      users: Array<Record<string, unknown>>;
      setupComplete: boolean;
      createdAt: number;
      defaultQueue: string;
    };
    raw.users[0] = { ...raw.users[0], acceptedTosVersion: 0 };
    await env.CONFIG_KV.put(ADMIN_CONFIG_KEY, JSON.stringify(raw));

    const blocked = await exports.default.fetch(
      new Request("https://example.com/api/admin/state?queue=default", {
        headers: { cookie },
      }),
    );
    expect(blocked.status).toBe(403);
    const blockedBody = await json<{ error?: { code?: string } }>(blocked);
    expect(blockedBody.error?.code).toBe("tos_required");

    const boot = await exports.default.fetch(
      new Request("https://example.com/api/admin/bootstrap", {
        headers: { cookie },
      }),
    );
    expect(
      await json<{ acceptedTosVersion: number | null; tosVersion: number }>(boot),
    ).toMatchObject({
      acceptedTosVersion: 0,
      tosVersion: TOS_VERSION,
    });

    const missing = await exports.default.fetch(
      new Request("https://example.com/api/admin/tos/accept", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(missing.status).toBe(400);

    const accepted = await exports.default.fetch(
      new Request("https://example.com/api/admin/tos/accept", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ acceptedTosVersion: TOS_VERSION }),
      }),
    );
    expect(accepted.status).toBe(200);

    const state = await exports.default.fetch(
      new Request("https://example.com/api/admin/state?queue=default", {
        headers: { cookie },
      }),
    );
    expect(state.status).toBe(200);
  });

  it("rejects invite accept without acceptedTosVersion", async () => {
    await resetAdmin();
    const ownerCookie = await setupAdmin("owner", ADMIN_PASSWORD);
    const created = await exports.default.fetch(
      new Request("https://example.com/api/admin/invites", {
        method: "POST",
        headers: { cookie: ownerCookie, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(created.status).toBe(200);
    const createdBody = await json<{ token: string }>(created);

    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: createdBody.token,
          username: "teammate",
          password: "Another-horse1",
          confirmPassword: "Another-horse1",
          ...turnstileBody(),
        }),
      }),
    );
    expect(denied.status).toBe(400);
  });
});
