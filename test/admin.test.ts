import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const SECRET = "test-token-secret-do-not-use-in-production";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function cookieFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length > 0) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  const single = response.headers.get("set-cookie");
  return single ? single.split(";")[0]! : "";
}

describe("admin setup wizard and dashboard", () => {
  it("serves the admin app", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/admin"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("TideGuard");
    expect(html).toContain("Setup");
    expect(html).toContain("/api/admin/setup");
  });

  it("reports setup incomplete before wizard finishes", async () => {
    await exports.default.fetch(
      new Request("https://example.com/api/admin/reset", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

    const response = await exports.default.fetch(
      new Request("https://example.com/api/admin/bootstrap"),
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ setupComplete: false });
  });

  it("completes setup, persists branding, and requires login afterward", async () => {
    await exports.default.fetch(
      new Request("https://example.com/api/admin/reset", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

    const setup = await exports.default.fetch(
      new Request("https://example.com/api/admin/setup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({
          password: "correct-horse",
          confirmPassword: "correct-horse",
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
    const setupBody = await json<{ ok: boolean; admissionMode: string }>(setup);
    expect(setupBody).toMatchObject({ ok: true, admissionMode: "lottery" });
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
    }>(state);
    expect(stateBody.branding.title).toBe("Launch hold");
    expect(stateBody.branding.showWaitingCount).toBe(true);
    expect(stateBody.admissionMode).toBe("lottery");

    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/state?queue=admin-q"),
    );
    expect(denied.status).toBe(401);

    const conflict = await exports.default.fetch(
      new Request("https://example.com/api/admin/setup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({
          password: "another-password",
          confirmPassword: "another-password",
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
        body: JSON.stringify({ password: "wrong-password" }),
      }),
    );
    expect(badLogin.status).toBe(401);

    const login = await exports.default.fetch(
      new Request("https://example.com/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "correct-horse" }),
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
    expect(html).toContain('const playTurnSound = true');

    const sound = await exports.default.fetch(
      new Request("https://example.com/sounds/notification.mp3"),
    );
    expect(sound.status).toBe(200);
    expect(sound.headers.get("content-type")).toMatch(/audio\/mpeg|mpeg/);
    const bytes = await sound.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("rejects admin setup without TOKEN_SECRET bearer", async () => {
    await exports.default.fetch(
      new Request("https://example.com/api/admin/reset", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password: "correct-horse",
          confirmPassword: "correct-horse",
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
