import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  ADMIN_SECRET,
  cookieFrom,
  resetAdmin,
  seedSetupPendingForTests,
  turnstileBody,
} from "./helpers/admin-setup";
import { env } from "cloudflare:workers";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("admin setup wizard and dashboard", () => {
  it("serves the admin app", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/admin"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("TideGuard");
    expect(html).toContain("Setup");
    expect(html).toContain("/api/admin/setup");
    expect(html).toContain("site-footer");
    expect(html).toContain("wizard-intro");
    expect(html).toContain("Claim the Worker");
    expect(html).toContain("Connect Cloudflare");
    expect(html).toContain("Protect admin login");
    expect(html).toContain("2. Cloudflare");
    expect(html).toContain("3. Turnstile");
    expect(html).toContain("setup-cf-sub-1");
    expect(html).toContain("setup-cf-sub-2");
    expect(html).toContain("setup-cf-sub-3");
    expect(html).toContain("Skip for now");
    expect(html).toContain("setup-pw-checklist");
    expect(html).toContain("One uppercase letter");
    expect(html).toContain("Check for updates");
    expect(html).toContain("/api/admin/updates");
  });

  it("exposes version on bootstrap and requires session for update check", async () => {
    const boot = await exports.default.fetch(
      new Request("https://example.com/api/admin/bootstrap"),
    );
    expect(boot.status).toBe(200);
    const bootBody = await json<{ version: string }>(boot);
    expect(bootBody.version).toMatch(/^\d+\.\d+\.\d+/);

    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/updates"),
    );
    expect(denied.status).toBe(401);
  });

  it("reports setup incomplete before wizard finishes", async () => {
    await resetAdmin();

    const response = await exports.default.fetch(
      new Request("https://example.com/api/admin/bootstrap"),
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ setupComplete: false });
  });

  it("rejects finish setup without Cloudflare and Turnstile pending", async () => {
    await resetAdmin();
    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/setup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ADMIN_SECRET}`,
        },
        body: JSON.stringify({
          username: "ops",
          password: "Correct-horse1",
          confirmPassword: "Correct-horse1",
          queue: "admin-q",
        }),
      }),
    );
    expect(denied.status).toBe(400);
  });

  it("completes setup, persists branding, and requires login afterward", async () => {
    await resetAdmin();
    await seedSetupPendingForTests(env);

    const setup = await exports.default.fetch(
      new Request("https://example.com/api/admin/setup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ADMIN_SECRET}`,
        },
        body: JSON.stringify({
          username: "ops",
          password: "Correct-horse1",
          confirmPassword: "Correct-horse1",
          queue: "admin-q",
          admissionMode: "lottery",
          branding: {
            title: "Launch hold",
            message: "We are pacing entry.",
            showWaitingCount: true,
            primaryColor: "#112233",
          },
        }),
      }),
    );
    expect(setup.status).toBe(200);
    const setupBody = await json<{ ok: boolean; admissionMode: string; username: string }>(setup);
    expect(setupBody).toMatchObject({ ok: true, admissionMode: "lottery", username: "ops" });
    const sessionCookie = cookieFrom(setup);
    expect(sessionCookie).toContain("tg_admin=");

    const state = await exports.default.fetch(
      new Request("https://example.com/api/admin/state?queue=admin-q", {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(state.status).toBe(200);
    const stateBody = await json<{
      branding: { title: string; showWaitingCount: boolean };
      admissionMode: string;
      me: { username: string };
      turnstile: { configured: boolean; sitekey: string | null };
    }>(state);
    expect(stateBody.branding.title).toBe("Launch hold");
    expect(stateBody.branding.showWaitingCount).toBe(true);
    expect(stateBody.admissionMode).toBe("lottery");
    expect(stateBody.me.username).toBe("ops");
    expect(stateBody.turnstile.configured).toBe(true);

    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/state?queue=admin-q"),
    );
    expect(denied.status).toBe(401);

    const conflict = await exports.default.fetch(
      new Request("https://example.com/api/admin/setup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ADMIN_SECRET}`,
        },
        body: JSON.stringify({
          username: "ops2",
          password: "Another-pass1",
          confirmPassword: "Another-pass1",
          queue: "admin-q",
        }),
      }),
    );
    expect(conflict.status).toBe(409);

    const logout = await exports.default.fetch(
      new Request("https://example.com/api/admin/logout", {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(logout.status).toBe(200);

    const badLogin = await exports.default.fetch(
      new Request("https://example.com/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "ops",
          password: "Wrong-pass1",
          ...turnstileBody(),
        }),
      }),
    );
    expect(badLogin.status).toBe(401);

    const loginNoTs = await exports.default.fetch(
      new Request("https://example.com/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "ops", password: "Correct-horse1" }),
      }),
    );
    expect(loginNoTs.status).toBe(401);

    const login = await exports.default.fetch(
      new Request("https://example.com/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "ops",
          password: "Correct-horse1",
          ...turnstileBody(),
        }),
      }),
    );
    expect(login.status).toBe(200);
    const loginCookie = cookieFrom(login);

    const save = await exports.default.fetch(
      new Request("https://example.com/api/admin/branding", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: loginCookie,
        },
        body: JSON.stringify({
          queue: "admin-q",
          branding: {
            title: "Updated title",
            message: "Updated message",
            showWaitingCount: false,
            requireClickToEnter: true,
            playTurnSound: true,
          },
        }),
      }),
    );
    expect(save.status).toBe(200);

    const wait = await exports.default.fetch(new Request("https://example.com/wait?queue=admin-q"));
    const html = await wait.text();
    expect(html).toContain("Updated title");
    expect(html).toContain("Updated message");
    expect(html).toContain("Play a sound when it’s my turn");
    expect(html).toContain("const playTurnSound = true");

    const sound = await exports.default.fetch(
      new Request("https://example.com/sounds/notification.mp3"),
    );
    expect(sound.status).toBe(200);
    expect(sound.headers.get("content-type")).toMatch(/audio\/mpeg|mpeg/);
    const bytes = await sound.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("rejects admin setup without TOKEN_SECRET bearer", async () => {
    await resetAdmin();

    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "ops",
          password: "Correct-horse1",
          confirmPassword: "Correct-horse1",
          queue: "admin-q",
        }),
      }),
    );
    expect(denied.status).toBe(401);
  });

  it("rejects admin reset without TOKEN_SECRET", async () => {
    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/reset", { method: "POST" }),
    );
    expect(denied.status).toBe(401);
  });
});
