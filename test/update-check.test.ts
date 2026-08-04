import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { UPDATE_CHECK_CACHE_KEY, checkForUpdates } from "../src/admin/update-check";
import { VERSION, compareSemVer, normalizeVersion } from "../src/version";

describe("version helpers", () => {
  it("normalizes leading v", () => {
    expect(normalizeVersion("v0.1.0")).toBe("0.1.0");
    expect(normalizeVersion("  V1.2.3 ")).toBe("1.2.3");
  });

  it("compares semver cores", () => {
    expect(compareSemVer("0.1.0", "0.1.0")).toBe(0);
    expect(compareSemVer("v0.1.0", "0.2.0")).toBeLessThan(0);
    expect(compareSemVer("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareSemVer("1.0.0", "0.9.9")).toBeGreaterThan(0);
  });
});

describe("checkForUpdates", () => {
  it("reports update available from GitHub latest release", async () => {
    await env.CONFIG_KV.delete(UPDATE_CHECK_CACHE_KEY);

    const result = await checkForUpdates(env, {
      force: true,
      now: 1_700_000_000_000,
      fetch: async () =>
        new Response(
          JSON.stringify({
            tag_name: "v0.4.0",
            html_url: "https://github.com/TideGuard/TideGuard/releases/tag/v0.4.0",
            name: "0.4.0",
            draft: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    expect(result.currentVersion).toBe(VERSION);
    expect(result.latestVersion).toBe("0.4.0");
    expect(result.latestTag).toBe("v0.4.0");
    expect(result.updateAvailable).toBe(true);
    expect(result.source).toBe("github");
    expect(result.message).toMatch(/Update available/);
  });

  it("treats matching release as up to date and reuses KV cache", async () => {
    await env.CONFIG_KV.delete(UPDATE_CHECK_CACHE_KEY);
    let fetches = 0;

    const fetchMock: typeof fetch = async () => {
      fetches += 1;
      return new Response(
        JSON.stringify({
          tag_name: `v${VERSION}`,
          html_url: `https://github.com/TideGuard/TideGuard/releases/tag/v${VERSION}`,
          name: VERSION,
          draft: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const first = await checkForUpdates(env, {
      force: true,
      now: 1_700_000_000_000,
      fetch: fetchMock,
    });
    expect(first.updateAvailable).toBe(false);
    expect(first.message).toMatch(/Up to date/);
    expect(fetches).toBe(1);

    const second = await checkForUpdates(env, {
      now: 1_700_000_000_000 + 60_000,
      fetch: fetchMock,
    });
    expect(second.cached).toBe(true);
    expect(second.source).toBe("cache");
    expect(second.updateAvailable).toBe(false);
    expect(fetches).toBe(1);
  });

  it("handles no releases (404) without claiming an update", async () => {
    await env.CONFIG_KV.delete(UPDATE_CHECK_CACHE_KEY);

    const result = await checkForUpdates(env, {
      force: true,
      fetch: async () => new Response("Not Found", { status: 404 }),
    });

    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(result.message).toMatch(/No GitHub releases/);
  });

  it("falls back to cache when GitHub is unreachable", async () => {
    await env.CONFIG_KV.delete(UPDATE_CHECK_CACHE_KEY);

    await checkForUpdates(env, {
      force: true,
      now: 1_700_000_000_000,
      fetch: async () =>
        new Response(
          JSON.stringify({
            tag_name: "v9.9.9",
            html_url: "https://github.com/TideGuard/TideGuard/releases/tag/v9.9.9",
            draft: false,
          }),
          { status: 200 },
        ),
    });

    const result = await checkForUpdates(env, {
      force: true,
      now: 1_700_000_100_000,
      fetch: async () => {
        throw new Error("network down");
      },
    });

    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe("9.9.9");
    expect(result.source).toBe("cache");
    expect(result.message).toMatch(/cached check/);
  });
});
