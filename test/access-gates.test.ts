import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  clearGeoBlockStats,
  readGeoBlockStats,
  recordGeoBlockHit,
  resetGeoBlockStatsWindow,
} from "../src/admin/geo-block-stats";

const SECRET = "test-token-secret-do-not-use-in-production";
const PASSWORD = "access-gates-pass";
const OFFICE_IP = "203.0.113.40";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function cookieFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length > 0) {
    return raw.map((c) => c.split(";")[0]!).join("; ");
  }
  const single = response.headers.get("set-cookie");
  return single ? single.split(";")[0]! : "";
}

async function resetAndSetup(queue = "gates-q"): Promise<string> {
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
        password: PASSWORD,
        confirmPassword: PASSWORD,
        queue,
        admissionMode: "queue",
      }),
    }),
  );
  expect(setup.status).toBe(200);
  return cookieFrom(setup);
}

async function waitForGeoHits(
  session: string,
  minHits: number,
  queue = "gates-q",
): Promise<number> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const metrics = await exports.default.fetch(
      new Request(`https://example.com/api/admin/metrics?queue=${encodeURIComponent(queue)}`, {
        headers: { cookie: session },
      }),
    );
    expect(metrics.status).toBe(200);
    const body = await json<{
      geoBlock: { stats: { totalHits: number } };
    }>(metrics);
    if (body.geoBlock.stats.totalHits >= minHits) {
      return body.geoBlock.stats.totalHits;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Expected at least ${minHits} geo hits within timeout`);
}

describe("IP allowlist bypass", () => {
  it("saves allowlist and skips /wait with CF-Connecting-IP", async () => {
    const session = await resetAndSetup();

    const bad = await exports.default.fetch(
      new Request("https://example.com/api/admin/bypass", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: session },
        body: JSON.stringify({ allowlistText: "not-an-ip" }),
      }),
    );
    expect(bad.status).toBe(400);

    const saved = await exports.default.fetch(
      new Request("https://example.com/api/admin/bypass", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: session,
          "cf-connecting-ip": OFFICE_IP,
        },
        body: JSON.stringify({ allowlistText: `${OFFICE_IP}/32\n# office` }),
      }),
    );
    expect(saved.status).toBe(200);
    const savedBody = await json<{
      bypass: { allowlist: string[]; clientIpMatched: boolean; connectingIpPresent: boolean };
    }>(saved);
    expect(savedBody.bypass.allowlist).toContain(`${OFFICE_IP}/32`);
    expect(savedBody.bypass.connectingIpPresent).toBe(true);
    expect(savedBody.bypass.clientIpMatched).toBe(true);

    const wait = await exports.default.fetch(
      new Request("https://example.com/wait?queue=gates-q&return=%2Fdemo", {
        redirect: "manual",
        headers: { "cf-connecting-ip": OFFICE_IP },
      }),
    );
    expect(wait.status).toBe(302);
    expect(wait.headers.get("location")).toContain("/demo");
    expect(cookieFrom(wait)).toContain("tg_access=");

    const demo = await exports.default.fetch(
      new Request("https://example.com/demo?queue=gates-q", {
        headers: { "cf-connecting-ip": OFFICE_IP },
      }),
    );
    expect(demo.status).toBe(200);
    const html = await demo.text();
    expect(html).toMatch(/protected|admitted|visitor/i);
    expect(cookieFrom(demo)).toContain("tg_access=");
  });

  it("does not trust X-Forwarded-For for bypass", async () => {
    const session = await resetAndSetup();
    await exports.default.fetch(
      new Request("https://example.com/api/admin/bypass", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: session },
        body: JSON.stringify({ allowlistText: OFFICE_IP }),
      }),
    );

    const wait = await exports.default.fetch(
      new Request("https://example.com/wait?queue=gates-q", {
        headers: { "x-forwarded-for": OFFICE_IP },
      }),
    );
    expect(wait.status).toBe(200);
    const html = await wait.text();
    expect(html).toContain("You’re in line");
    expect(html).not.toContain("<title>Not available</title>");
    expect(cookieFrom(wait)).not.toContain("tg_access=");
  });
});

describe("country block gate", () => {
  it("saves geo block and returns 403 on /wait and /join", async () => {
    const session = await resetAndSetup();

    const bad = await exports.default.fetch(
      new Request("https://example.com/api/admin/geo-block", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: session },
        body: JSON.stringify({
          enabled: true,
          countriesText: "USA",
          ttlHours: 1,
        }),
      }),
    );
    expect(bad.status).toBe(400);

    const saved = await exports.default.fetch(
      new Request("https://example.com/api/admin/geo-block", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: session,
          "cf-ipcountry": "US",
        },
        body: JSON.stringify({
          enabled: true,
          countriesText: "CN\nRU",
          ttlHours: 24,
        }),
      }),
    );
    expect(saved.status).toBe(200);
    const savedBody = await json<{
      geoBlock: { active: boolean; countries: string[]; stats: { totalHits: number } };
    }>(saved);
    expect(savedBody.geoBlock.active).toBe(true);
    expect(savedBody.geoBlock.countries).toEqual(["CN", "RU"]);
    expect(savedBody.geoBlock.stats.totalHits).toBe(0);

    const wait = await exports.default.fetch(
      new Request("https://example.com/wait?queue=gates-q", {
        headers: { "cf-ipcountry": "CN" },
      }),
    );
    expect(wait.status).toBe(403);
    expect(await wait.text()).toContain("Not available");

    const embed = await exports.default.fetch(
      new Request("https://example.com/wait?queue=gates-q&embed=1", {
        headers: { "cf-ipcountry": "CN" },
      }),
    );
    expect(embed.status).toBe(403);

    const join = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-ipcountry": "RU",
        },
        body: JSON.stringify({ queue: "gates-q" }),
      }),
    );
    expect(join.status).toBe(403);
    const joinBody = await json<{ error: { code: string; details?: { country?: string } } }>(join);
    expect(joinBody.error.code).toBe("forbidden");
    expect(joinBody.error.details?.country).toBe("RU");

    const hits = await waitForGeoHits(session, 1);
    expect(hits).toBeGreaterThanOrEqual(1);

    const openCountry = await exports.default.fetch(
      new Request("https://example.com/wait?queue=gates-q", {
        headers: { "cf-ipcountry": "US" },
      }),
    );
    expect(openCountry.status).toBe(200);
    expect(await openCountry.text()).toContain("TideGuard");
  });

  it("blocks protected origin paths before redirecting to /wait", async () => {
    const session = await resetAndSetup("default");

    const origin = await exports.default.fetch(
      new Request("https://example.com/api/admin/origin", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: session },
        body: JSON.stringify({
          enabled: true,
          originUrl: "https://origin.example.com",
          protectAll: true,
          pathPrefixes: "",
          queue: "default",
        }),
      }),
    );
    expect(origin.status).toBe(200);

    const geo = await exports.default.fetch(
      new Request("https://example.com/api/admin/geo-block", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: session },
        body: JSON.stringify({
          enabled: true,
          countriesText: "CN",
          ttlHours: 2,
        }),
      }),
    );
    expect(geo.status).toBe(200);

    const blocked = await exports.default.fetch(
      new Request("https://example.com/checkout", {
        redirect: "manual",
        headers: { "cf-ipcountry": "CN" },
      }),
    );
    expect(blocked.status).toBe(403);
    expect(await blocked.text()).toContain("Not available");
  });

  it("lets IP allowlist override an active country block", async () => {
    const session = await resetAndSetup();

    await exports.default.fetch(
      new Request("https://example.com/api/admin/geo-block", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: session },
        body: JSON.stringify({
          enabled: true,
          countriesText: "CN",
          ttlHours: 6,
        }),
      }),
    );
    await exports.default.fetch(
      new Request("https://example.com/api/admin/bypass", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: session },
        body: JSON.stringify({ allowlistText: OFFICE_IP }),
      }),
    );

    const wait = await exports.default.fetch(
      new Request("https://example.com/wait?queue=gates-q&return=%2Fdemo", {
        redirect: "manual",
        headers: {
          "cf-ipcountry": "CN",
          "cf-connecting-ip": OFFICE_IP,
        },
      }),
    );
    expect(wait.status).toBe(302);
    expect(wait.headers.get("location")).toContain("/demo");

    const join = await exports.default.fetch(
      new Request("https://example.com/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-ipcountry": "CN",
          "cf-connecting-ip": OFFICE_IP,
        },
        body: JSON.stringify({ queue: "gates-q" }),
      }),
    );
    // Join still runs for allowlisted IPs (geo gate skips them); they may queue normally.
    expect(join.status).toBe(200);
  });
});

describe("Pass queue", () => {
  it("issues an admission cookie that unlocks /demo under a geo block", async () => {
    const session = await resetAndSetup();

    await exports.default.fetch(
      new Request("https://example.com/api/admin/geo-block", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: session },
        body: JSON.stringify({
          enabled: true,
          countriesText: "CN",
          ttlHours: 12,
        }),
      }),
    );

    const pass = await exports.default.fetch(
      new Request("https://example.com/api/admin/pass", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: session },
        body: JSON.stringify({ queue: "gates-q", returnTo: "/demo" }),
      }),
    );
    expect(pass.status).toBe(200);
    const passBody = await json<{ ok: boolean; redirectTo: string; visitorId: string }>(pass);
    expect(passBody.ok).toBe(true);
    expect(passBody.redirectTo).toBe("/demo");
    expect(passBody.visitorId).toMatch(/^admin_pass_/);
    const accessCookie = cookieFrom(pass);
    expect(accessCookie).toContain("tg_access=");

    const demo = await exports.default.fetch(
      new Request("https://example.com/demo?queue=gates-q", {
        headers: {
          cookie: accessCookie,
          "cf-ipcountry": "CN",
        },
      }),
    );
    expect(demo.status).toBe(200);
    expect(await demo.text()).toMatch(/protected|admitted|visitor/i);

    const stillBlocked = await exports.default.fetch(
      new Request("https://example.com/wait?queue=gates-q", {
        headers: { "cf-ipcountry": "CN" },
      }),
    );
    expect(stillBlocked.status).toBe(403);
  });

  it("requires an admin session", async () => {
    await resetAndSetup();
    const denied = await exports.default.fetch(
      new Request("https://example.com/api/admin/pass", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: "gates-q" }),
      }),
    );
    expect(denied.status).toBe(401);
  });
});

describe("Cloudflare access helper", () => {
  it("saves zone credentials and rejects check without a token", async () => {
    const session = await resetAndSetup();

    const saved = await exports.default.fetch(
      new Request("https://example.com/api/admin/cloudflare", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: session },
        body: JSON.stringify({
          zoneId: "0123456789abcdef0123456789abcdef",
          hostname: "shop.example.com",
          apiToken: "cf-test-token-at-least-20-chars",
        }),
      }),
    );
    expect(saved.status).toBe(200);
    const body = await json<{
      bypass: { zoneId: string | null; hostname: string | null; hasApiToken: boolean };
    }>(saved);
    expect(body.bypass.zoneId).toBe("0123456789abcdef0123456789abcdef");
    expect(body.bypass.hostname).toBe("shop.example.com");
    expect(body.bypass.hasApiToken).toBe(true);

    // Fresh setup without token → check fails with clear error.
    const session2 = await resetAndSetup();
    await exports.default.fetch(
      new Request("https://example.com/api/admin/cloudflare", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: session2 },
        body: JSON.stringify({
          zoneId: "0123456789abcdef0123456789abcdef",
          hostname: "shop.example.com",
        }),
      }),
    );
    const check = await exports.default.fetch(
      new Request("https://example.com/api/admin/cloudflare/check", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: session2 },
        body: "{}",
      }),
    );
    expect(check.status).toBe(400);
    const checkBody = await json<{ error: { message: string } }>(check);
    expect(checkBody.error.message).toMatch(/API token/i);
  });
});

describe("geo block hit counters", () => {
  it("records and resets hit windows in KV", async () => {
    await clearGeoBlockStats(env);
    await resetGeoBlockStatsWindow(env);
    await recordGeoBlockHit(env, "CN");
    await recordGeoBlockHit(env, "CN");
    await recordGeoBlockHit(env, "RU");

    const stats = await readGeoBlockStats(env);
    expect(stats.totalHits).toBe(3);
    expect(stats.byCountry.CN).toBe(2);
    expect(stats.byCountry.RU).toBe(1);
    expect(stats.lastHitCountry).toBe("RU");

    const reset = await resetGeoBlockStatsWindow(env);
    expect(reset.totalHits).toBe(0);
    expect(reset.byCountry).toEqual({});
  });
});
