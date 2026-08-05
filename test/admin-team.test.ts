import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  ADMIN_PASSWORD,
  ADMIN_SECRET,
  resetAdmin,
  setupAdmin,
  turnstileBody,
} from "./helpers/admin-setup";
import { DEFAULT_QUEUE_CONFIG } from "../src/core/config";
import { TOS_VERSION } from "../src/admin/tos";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Pause → join waiters → unpause (no auto-admit until alarm/force). */
async function seedWaiters(queue: string, ids: string[]) {
  const cfg = { ...DEFAULT_QUEUE_CONFIG, maxConcurrentUsers: 10, admitPerSecond: 1 };
  const room = env.QUEUE_ROOM.getByName(queue);
  await room.setPaused(true);
  for (const visitorId of ids) {
    const joined = await room.join({ queue, config: cfg, visitorId });
    expect(joined.status).toBe("waiting");
  }
  await room.setPaused(false);
  return { room, cfg };
}

describe("admin password and team users", () => {
  it("changes own password and rejects wrong current password", async () => {
    await resetAdmin();
    const cookie = await setupAdmin("ops", ADMIN_PASSWORD);

    const bad = await exports.default.fetch(
      new Request("https://example.com/api/admin/password", {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: "Wrong-pass1",
          password: "Brand-new1",
          confirmPassword: "Brand-new1",
        }),
      }),
    );
    expect(bad.status).toBe(401);

    const ok = await exports.default.fetch(
      new Request("https://example.com/api/admin/password", {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: ADMIN_PASSWORD,
          password: "Brand-new1",
          confirmPassword: "Brand-new1",
        }),
      }),
    );
    expect(ok.status).toBe(200);

    const oldLogin = await exports.default.fetch(
      new Request("https://example.com/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "ops",
          password: ADMIN_PASSWORD,
          ...turnstileBody(),
        }),
      }),
    );
    expect(oldLogin.status).toBe(401);

    const newLogin = await exports.default.fetch(
      new Request("https://example.com/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "ops",
          password: "Brand-new1",
          ...turnstileBody(),
        }),
      }),
    );
    expect(newLogin.status).toBe(200);
  });

  it("removes another admin but blocks self-remove and last-admin", async () => {
    await resetAdmin();
    const ownerCookie = await setupAdmin("owner", ADMIN_PASSWORD);

    const created = await exports.default.fetch(
      new Request("https://example.com/api/admin/invites", {
        method: "POST",
        headers: { cookie: ownerCookie, "content-type": "application/json" },
        body: "{}",
      }),
    );
    const invite = await json<{ token: string }>(created);
    const accept = await exports.default.fetch(
      new Request("https://example.com/api/admin/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: invite.token,
          username: "teammate",
          password: "Another-horse1",
          confirmPassword: "Another-horse1",
          acceptedTosVersion: TOS_VERSION,
          ...turnstileBody(),
        }),
      }),
    );
    expect(accept.status).toBe(200);

    const state = await exports.default.fetch(
      new Request("https://example.com/api/admin/state", {
        headers: { cookie: ownerCookie },
      }),
    );
    const stateBody = await json<{
      me: { id: string };
      team: { users: Array<{ id: string; username: string }> };
    }>(state);
    const teammate = stateBody.team.users.find((u) => u.username === "teammate");
    expect(teammate).toBeTruthy();

    const selfRemove = await exports.default.fetch(
      new Request(`https://example.com/api/admin/users/${stateBody.me.id}`, {
        method: "DELETE",
        headers: { cookie: ownerCookie },
      }),
    );
    expect(selfRemove.status).toBe(400);

    const removed = await exports.default.fetch(
      new Request(`https://example.com/api/admin/users/${teammate!.id}`, {
        method: "DELETE",
        headers: { cookie: ownerCookie },
      }),
    );
    expect(removed.status).toBe(200);

    const after = await exports.default.fetch(
      new Request("https://example.com/api/admin/state", {
        headers: { cookie: ownerCookie },
      }),
    );
    const afterBody = await json<{ team: { users: Array<{ username: string }> } }>(after);
    expect(afterBody.team.users.map((u) => u.username)).toEqual(["owner"]);

    const lastRemove = await exports.default.fetch(
      new Request(`https://example.com/api/admin/users/${stateBody.me.id}`, {
        method: "DELETE",
        headers: { cookie: ownerCookie },
      }),
    );
    expect(lastRemove.status).toBe(400);
  });

  it("factory reset succeeds with TOKEN_SECRET and clears claim", async () => {
    await resetAdmin();
    await setupAdmin();
    const reset = await exports.default.fetch(
      new Request("https://example.com/api/admin/reset", {
        method: "POST",
        headers: { authorization: `Bearer ${ADMIN_SECRET}` },
      }),
    );
    expect(reset.status).toBe(200);
    const body = await json<{ ok: boolean; setupComplete: boolean }>(reset);
    expect(body.ok).toBe(true);
    expect(body.setupComplete).toBe(false);

    const boot = await exports.default.fetch(
      new Request("https://example.com/api/admin/bootstrap"),
    );
    expect(boot.status).toBe(200);
    const bootBody = await json<{ claimed: boolean; setupComplete: boolean }>(boot);
    expect(bootBody.claimed).toBe(false);
    expect(bootBody.setupComplete).toBe(false);
  });
});

describe("force-admit with waiters", () => {
  it("admits waiting visitors via session cookie POST /admit", async () => {
    await resetAdmin();
    const cookie = await setupAdmin();
    const queue = "force-session";
    const { room, cfg } = await seedWaiters(queue, ["w1", "w2", "w3"]);

    const before = await room.metrics({ queue, config: cfg });
    expect(before.waiting).toBe(3);

    const admit = await exports.default.fetch(
      new Request("https://example.com/admit", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ queue, count: 2 }),
      }),
    );
    expect(admit.status).toBe(200);
    const admitBody = await json<{ admitted: string[]; waiting: number }>(admit);
    expect(admitBody.admitted).toHaveLength(2);
    expect(admitBody.waiting).toBe(1);
  });

  it("force-admits with TOKEN_SECRET bearer when waiters exist", async () => {
    await resetAdmin();
    await setupAdmin();
    const queue = "force-bearer";
    await seedWaiters(queue, ["a", "b", "c"]);

    const admit = await exports.default.fetch(
      new Request("https://example.com/admit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ADMIN_SECRET}`,
        },
        body: JSON.stringify({ queue, count: 2 }),
      }),
    );
    expect(admit.status).toBe(200);
    const body = await json<{ admitted: string[] }>(admit);
    expect(body.admitted).toHaveLength(2);
  });
});
