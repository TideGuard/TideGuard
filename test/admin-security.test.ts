import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { cookieFrom, resetAdmin, setupAdmin, turnstileBody } from "./helpers/admin-setup";
import { TOS_VERSION } from "../src/admin/tos";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("first-run redirect", () => {
  it("redirects / to /admin when setup is incomplete", async () => {
    await resetAdmin();
    const response = await exports.default.fetch(
      new Request("https://example.com/", { redirect: "manual" }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/admin");
  });

  it("serves landing after setup", async () => {
    await resetAdmin();
    await setupAdmin();
    const response = await exports.default.fetch(new Request("https://example.com/"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("TideGuard");
  });
});

describe("multi-admin invites and audit", () => {
  it("creates and accepts an invite, then audits consequential actions", async () => {
    await resetAdmin();
    const ownerCookie = await setupAdmin("owner", "Correct-horse1");

    const created = await exports.default.fetch(
      new Request("https://example.com/api/admin/invites", {
        method: "POST",
        headers: { cookie: ownerCookie, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(created.status).toBe(200);
    const createdBody = await json<{
      token: string;
      acceptUrl: string;
      invite: { id: string };
    }>(created);
    expect(createdBody.token).toContain(".");
    expect(createdBody.acceptUrl).toContain("/admin?invite=");

    const accept = await exports.default.fetch(
      new Request("https://example.com/api/admin/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: createdBody.token,
          username: "teammate",
          password: "Another-horse1",
          confirmPassword: "Another-horse1",
          acceptedTosVersion: TOS_VERSION,
          ...turnstileBody(),
        }),
      }),
    );
    expect(accept.status).toBe(200);
    const teammateCookie = cookieFrom(accept);
    expect(teammateCookie).toContain("tg_admin=");

    const reuse = await exports.default.fetch(
      new Request("https://example.com/api/admin/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: createdBody.token,
          username: "other",
          password: "Another-horse1",
          confirmPassword: "Another-horse1",
          acceptedTosVersion: TOS_VERSION,
          ...turnstileBody(),
        }),
      }),
    );
    expect(reuse.status).toBe(400);

    const pause = await exports.default.fetch(
      new Request("https://example.com/api/admin/pause", {
        method: "POST",
        headers: { cookie: teammateCookie, "content-type": "application/json" },
        body: JSON.stringify({ queue: "default", paused: true }),
      }),
    );
    expect(pause.status).toBe(200);

    const audit = await exports.default.fetch(
      new Request("https://example.com/api/admin/audit", {
        headers: { cookie: ownerCookie },
      }),
    );
    expect(audit.status).toBe(200);
    const auditBody = await json<{
      events: Array<{ action: string; actorUsername: string }>;
    }>(audit);
    expect(auditBody.events.some((e) => e.action === "invite.create")).toBe(true);
    expect(auditBody.events.some((e) => e.action === "invite.accept")).toBe(true);
    expect(
      auditBody.events.some((e) => e.action === "pause.on" && e.actorUsername === "teammate"),
    ).toBe(true);

    const state = await exports.default.fetch(
      new Request("https://example.com/api/admin/state", {
        headers: { cookie: ownerCookie },
      }),
    );
    const stateBody = await json<{
      me: { username: string };
      team: { users: Array<{ username: string }> };
    }>(state);
    expect(stateBody.me.username).toBe("owner");
    expect(stateBody.team.users.map((u) => u.username).sort()).toEqual(["owner", "teammate"]);
  });

  it("revokes a pending invite", async () => {
    await resetAdmin();
    const cookie = await setupAdmin();
    const created = await exports.default.fetch(
      new Request("https://example.com/api/admin/invites", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: "{}",
      }),
    );
    const body = await json<{ invite: { id: string }; token: string }>(created);

    const revoked = await exports.default.fetch(
      new Request(`https://example.com/api/admin/invites/${body.invite.id}`, {
        method: "DELETE",
        headers: { cookie },
      }),
    );
    expect(revoked.status).toBe(200);

    const accept = await exports.default.fetch(
      new Request("https://example.com/api/admin/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: body.token,
          username: "nope",
          password: "Correct-horse1",
          confirmPassword: "Correct-horse1",
          acceptedTosVersion: TOS_VERSION,
          ...turnstileBody(),
        }),
      }),
    );
    expect(accept.status).toBe(400);
  });

  it("migrates legacy single-password admin config", async () => {
    await resetAdmin();
    const { hashPassword } = await import("../src/auth/password");
    const { hash, salt } = await hashPassword("Legacy-pass1");
    await env.CONFIG_KV.put(
      "admin:config",
      JSON.stringify({
        setupComplete: true,
        passwordHash: hash,
        passwordSalt: salt,
        createdAt: Date.now(),
        defaultQueue: "default",
      }),
    );

    const login = await exports.default.fetch(
      new Request("https://example.com/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "Legacy-pass1" }),
      }),
    );
    expect(login.status).toBe(200);

    const raw = await env.CONFIG_KV.get("admin:config", "json");
    const cfg = raw as { users?: Array<{ username: string }> };
    expect(cfg.users?.[0]?.username).toBe("admin");
  });
});
