import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WEBHOOK_SETTINGS,
  clearWebhookSettings,
  openWebhookSecret,
  parseWebhookEvents,
  readWebhookSettings,
  sanitizeWebhookUrl,
  sealWebhookSecret,
  toPublicWebhooks,
  writeWebhookSettings,
  type WebhookSettings,
} from "../src/admin/webhook-store";
import {
  deliverWebhook,
  dispatchWebhook,
  maybeDispatchDepthWebhook,
  maybeDispatchQueueFullWebhook,
  maybeDispatchScheduleOpenWebhook,
} from "../src/admin/webhook-dispatch";
import { TRAFFIC_RETENTION_MS } from "../src/queue/traffic";
import { resolveWaitingRoomLocale, waitingRoomStrings } from "../src/html/waiting-room-i18n";
import { renderWaitingRoom } from "../src/html/waiting-room";
import { sanitizeBrandingInput } from "../src/admin/store";
import { sanitizeGoogleAnalyticsId, sanitizeHttpsImageUrl } from "../src/core/branding";
import { securityHeaders } from "../src/auth/cookies";
import { renderGeoBlockedPage } from "../src/html/geo-blocked";
import { parsePathPrefixes } from "../src/core/origin";
import { parseAdminHash, hashForSection } from "../admin/src/lib/admin-hash";

function mockEnv(store = new Map<string, string>()): Env {
  return {
    TOKEN_SECRET: "test-token-secret-do-not-use-in-production",
    CONFIG_KV: {
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
    },
  } as unknown as Env;
}

describe("traffic retention", () => {
  it("retains 24 hours of buckets", () => {
    expect(TRAFFIC_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("parsePathPrefixes newlines", () => {
  it("accepts commas and newlines", () => {
    expect(parsePathPrefixes("/a\n/b/\n,/c")).toEqual(["/a", "/b", "/c"]);
  });
});

describe("webhook store", () => {
  it("parses known events and falls back", () => {
    expect(parseWebhookEvents(["pause", "nope", "depth", "queue_full", "schedule_open"])).toEqual([
      "pause",
      "depth",
      "queue_full",
      "schedule_open",
    ]);
    expect(parseWebhookEvents(null)).toEqual(DEFAULT_WEBHOOK_SETTINGS.events);
    expect(parseWebhookEvents([])).toEqual(DEFAULT_WEBHOOK_SETTINGS.events);
  });

  it("rejects private and non-https webhook URLs", () => {
    expect(sanitizeWebhookUrl("https://hooks.example.com/tg")).toBe("https://hooks.example.com/tg");
    expect(sanitizeWebhookUrl("http://hooks.example.com/tg")).toBeNull();
    expect(sanitizeWebhookUrl("https://127.0.0.1/hook")).toBeNull();
    expect(sanitizeWebhookUrl("https://169.254.169.254/latest")).toBeNull();
    expect(sanitizeWebhookUrl("https://localhost/hook")).toBeNull();
  });

  it("hides sealed secret in public view", () => {
    const settings: WebhookSettings = {
      ...DEFAULT_WEBHOOK_SETTINGS,
      enabled: true,
      url: "https://hooks.example.com/tg",
      sealedSecret: "sealed",
    };
    const pub = toPublicWebhooks(settings);
    expect(pub.hasSecret).toBe(true);
    expect("sealedSecret" in pub).toBe(false);
  });

  it("reads writes clears and seals secrets", async () => {
    const store = new Map<string, string>();
    const env = mockEnv(store);
    expect(await readWebhookSettings(env)).toEqual(DEFAULT_WEBHOOK_SETTINGS);

    const sealed = await sealWebhookSecret(env, "hook-secret");
    await writeWebhookSettings(env, {
      enabled: true,
      url: "https://hooks.example.com/tg",
      events: ["pause"],
      depthThreshold: 3,
      sealedSecret: sealed,
      updatedAt: 99,
    });
    const loaded = await readWebhookSettings(env);
    expect(loaded.enabled).toBe(true);
    expect(loaded.depthThreshold).toBe(3);
    expect(await openWebhookSecret(env, sealed)).toBe("hook-secret");
    expect(await openWebhookSecret(env, "not-a-blob")).toBeNull();

    await clearWebhookSettings(env);
    expect(await readWebhookSettings(env)).toEqual(DEFAULT_WEBHOOK_SETTINGS);
  });
});

describe("webhook dispatch", () => {
  it("posts signed pause events and skips when disabled", async () => {
    const store = new Map<string, string>();
    const env = mockEnv(store);
    const sealed = await sealWebhookSecret(env, "sig");
    await writeWebhookSettings(env, {
      enabled: true,
      url: "https://hooks.example.com/tg",
      events: ["pause", "health"],
      depthThreshold: 10,
      sealedSecret: sealed,
      updatedAt: 1,
    });

    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchWebhook(env, "pause", "default", { paused: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-tideguard-signature"]).toBeTruthy();
    expect(headers["user-agent"]).toContain("TideGuard-Webhook");

    await writeWebhookSettings(env, {
      ...DEFAULT_WEBHOOK_SETTINGS,
      enabled: false,
      updatedAt: 2,
    });
    await dispatchWebhook(env, "pause", "default", { paused: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});

describe("depth webhook debounce", () => {
  it("fires once above threshold then clears when below", async () => {
    const store = new Map<string, string>();
    const env = mockEnv(store);

    store.set(
      "admin:webhooks",
      JSON.stringify({
        enabled: true,
        url: "https://hooks.example.com/tg",
        events: ["depth"],
        depthThreshold: 5,
        updatedAt: 1,
      }),
    );

    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await maybeDispatchDepthWebhook(env, "default", 10);
    await maybeDispatchDepthWebhook(env, "default", 12);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await maybeDispatchDepthWebhook(env, "default", 2);
    await maybeDispatchDepthWebhook(env, "default", 9);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it("fires depth_cleared when subscribed", async () => {
    const store = new Map<string, string>();
    const env = mockEnv(store);
    await writeWebhookSettings(env, {
      enabled: true,
      url: "https://hooks.example.com/tg",
      events: ["depth", "depth_cleared"],
      depthThreshold: 5,
      updatedAt: 1,
    });
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await maybeDispatchDepthWebhook(env, "default", 10);
    await maybeDispatchDepthWebhook(env, "default", 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    expect(bodies.map((b: { event: string }) => b.event)).toEqual(["depth", "depth_cleared"]);
    vi.unstubAllGlobals();
  });
});

describe("schedule_open webhook", () => {
  it("fires only on transition from waiting-for-open to open", async () => {
    const store = new Map<string, string>();
    const env = mockEnv(store);
    await writeWebhookSettings(env, {
      enabled: true,
      url: "https://hooks.example.com/tg",
      events: ["schedule_open"],
      depthThreshold: 100,
      updatedAt: 1,
    });
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const future = Date.now() + 60_000;
    await maybeDispatchScheduleOpenWebhook(env, "default", future);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    await maybeDispatchScheduleOpenWebhook(env, "default", null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await maybeDispatchScheduleOpenWebhook(env, "default", null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("webhook test delivery", () => {
  it("records lastDelivery even when disabled", async () => {
    const store = new Map<string, string>();
    const env = mockEnv(store);
    await writeWebhookSettings(env, {
      ...DEFAULT_WEBHOOK_SETTINGS,
      enabled: false,
      url: "https://hooks.example.com/tg",
      updatedAt: 1,
    });
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const delivery = await deliverWebhook(
      env,
      "test",
      "default",
      { ok: true },
      { requireEnabled: false },
    );
    expect(delivery.status).toBe(200);
    expect(delivery.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const settings = await readWebhookSettings(env);
    expect(settings.lastDelivery?.event).toBe("test");
    vi.unstubAllGlobals();
  });

  it("records error when fetch fails and when URL missing", async () => {
    const store = new Map<string, string>();
    const env = mockEnv(store);
    const missing = await deliverWebhook(env, "test", "default", {}, { requireEnabled: false });
    expect(missing.error).toContain("No webhook URL");
    await writeWebhookSettings(env, {
      ...DEFAULT_WEBHOOK_SETTINGS,
      url: "https://hooks.example.com/tg",
      updatedAt: 1,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    const failed = await deliverWebhook(env, "test", "default", {}, { requireEnabled: false });
    expect(failed.status).toBeNull();
    expect(failed.error).toBe("timeout");
    vi.unstubAllGlobals();
  });

  it("fails closed when sealed signing secret cannot be opened", async () => {
    const store = new Map<string, string>();
    const env = mockEnv(store);
    await writeWebhookSettings(env, {
      ...DEFAULT_WEBHOOK_SETTINGS,
      enabled: true,
      url: "https://hooks.example.com/tg",
      events: ["pause"],
      sealedSecret: "not-a-valid-sealed-blob",
      updatedAt: 1,
    });
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const delivery = await deliverWebhook(env, "pause", "default", { paused: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(delivery.error).toContain("Signing secret");
    vi.unstubAllGlobals();
  });
});

describe("queue_full webhook debounce", () => {
  it("fires once per debounce window", async () => {
    const store = new Map<string, string>();
    const env = mockEnv(store);
    await writeWebhookSettings(env, {
      enabled: true,
      url: "https://hooks.example.com/tg",
      events: ["queue_full"],
      depthThreshold: 100,
      updatedAt: 1,
    });
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await maybeDispatchQueueFullWebhook(env, "default");
    await maybeDispatchQueueFullWebhook(env, "default");
    await maybeDispatchQueueFullWebhook(env, "default");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("branding https image urls", () => {
  it("accepts https and rejects http / junk", () => {
    expect(sanitizeHttpsImageUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
    expect(sanitizeHttpsImageUrl("http://cdn.example.com/a.png")).toBe("");
    expect(sanitizeHttpsImageUrl("not-a-url", "fallback")).toBe("fallback");
    expect(sanitizeHttpsImageUrl("")).toBe("");
  });

  it("soft-merges logo and favicon on sanitize", () => {
    const branding = sanitizeBrandingInput({
      logoUrl: "https://cdn.example.com/logo.svg",
      faviconUrl: "https://cdn.example.com/favicon.ico",
    });
    expect(branding.logoUrl).toContain("logo.svg");
    expect(branding.faviconUrl).toContain("favicon.ico");
  });
});

describe("admin hash deep links", () => {
  it("maps panel ids to sections", () => {
    expect(parseAdminHash("#webhooks")).toEqual({ section: "system", panelId: "webhooks" });
    expect(parseAdminHash("#admission")).toEqual({ section: "admission", panelId: null });
    expect(parseAdminHash("#turnstile")).toEqual({ section: "cloudflare", panelId: "turnstile" });
    expect(hashForSection("live")).toBe("#live");
  });
});

describe("geo-blocked branding", () => {
  it("uses branding CSS vars and logo", () => {
    const html = renderGeoBlockedPage({
      country: "US",
      branding: {
        backgroundColor: "#112233",
        logoUrl: "https://cdn.example.com/logo.png",
        faviconUrl: "https://cdn.example.com/f.ico",
      },
    });
    expect(html).toContain("--bg: #112233");
    expect(html).toContain('src="https://cdn.example.com/logo.png"');
    expect(html).toContain('rel="icon"');
  });
});

describe("waiting room i18n / a11y / embed", () => {
  it("resolves supported query and Accept-Language locales", () => {
    expect(resolveWaitingRoomLocale("en")).toBe("en");
    expect(resolveWaitingRoomLocale("es")).toBe("es");
    expect(resolveWaitingRoomLocale("fr")).toBe("fr");
    expect(resolveWaitingRoomLocale("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(resolveWaitingRoomLocale("zh,ja;q=0.8,en;q=0.7")).toBe("ja");
    expect(resolveWaitingRoomLocale("es-MX,en;q=0.8")).toBe("es");
    expect(waitingRoomStrings("en").brand).toBe("TideGuard");
    expect(waitingRoomStrings("es").positionLabel).toBe("Posición");
    expect(waitingRoomStrings("es").statusReconnect).toContain("fila");
  });

  it("renders a11y hooks and embed height script", () => {
    const html = renderWaitingRoom({
      queue: "default",
      embed: true,
      locale: "en",
      opensAt: Date.now() + 60_000,
    });
    expect(html).toContain('lang="en"');
    expect(html).toContain("is-embed");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("tideguard-embed-height");
    expect(html).toContain("Next update");
    expect(html).toContain("Queue is open — keep this tab open until you enter");
    expect(html).not.toContain("googletagmanager.com/gtag/js");
  });

  it("injects Google Analytics gtag when Measurement ID is set", () => {
    const html = renderWaitingRoom({
      queue: "default",
      branding: { googleAnalyticsId: "G-ABC123XYZ" },
    });
    expect(html).toContain("https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ");
    expect(html).toContain("gtag('config', 'G-ABC123XYZ')");
  });

  it("injects configured visitor Turnstile and notification behavior", () => {
    const html = renderWaitingRoom({
      queue: "default",
      turnstileSitekey: "site-key",
      branding: {
        joinTurnstileEnabled: true,
        enableWebNotifications: true,
      },
    });
    expect(html).toContain("challenges.cloudflare.com/turnstile/v0/api.js");
    expect(html).toContain("site-key");
    expect(html).toContain("Notification.requestPermission");
  });
});

describe("Google Analytics Measurement ID", () => {
  it("sanitizes valid G- IDs and clears junk", () => {
    expect(sanitizeGoogleAnalyticsId("g-abc123")).toBe("G-ABC123");
    expect(sanitizeGoogleAnalyticsId("G-XYZ9")).toBe("G-XYZ9");
    expect(sanitizeGoogleAnalyticsId("")).toBe("");
    expect(sanitizeGoogleAnalyticsId("UA-12345-1")).toBe("");
    expect(sanitizeGoogleAnalyticsId("<script>")).toBe("");
    expect(sanitizeGoogleAnalyticsId("GTM-XXXX")).toBe("");
  });

  it("persists Measurement ID through branding sanitize", () => {
    const branding = sanitizeBrandingInput({ googleAnalyticsId: "g-test99" });
    expect(branding.googleAnalyticsId).toBe("G-TEST99");
    expect(sanitizeBrandingInput({ googleAnalyticsId: "not-an-id" }).googleAnalyticsId).toBe("");
    expect(
      sanitizeBrandingInput({
        joinTurnstileEnabled: true,
        enableWebNotifications: true,
      }),
    ).toMatchObject({ joinTurnstileEnabled: true, enableWebNotifications: true });
  });

  it("allows Google Analytics hosts in CSP", () => {
    const csp = String(securityHeaders()["content-security-policy"]);
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("https://*.google-analytics.com");
    expect(csp).toContain("https://*.analytics.google.com");
  });

  it("renders Spanish locale and logo/favicon branding", () => {
    const html = renderWaitingRoom({
      queue: "default",
      locale: "es",
      branding: {
        logoUrl: "https://cdn.example.com/logo.png",
        faviconUrl: "https://cdn.example.com/f.ico",
        title: "Cola",
        message: "Espera",
      },
    });
    expect(html).toContain('lang="es"');
    expect(html).toContain('src="https://cdn.example.com/logo.png"');
    expect(html).toContain('rel="icon"');
    expect(html).toContain("Cola");
  });
});
