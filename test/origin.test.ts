import { describe, expect, it } from "vitest";
import {
  buildUpstreamUrl,
  isTideGuardPath,
  mergeOriginConfig,
  normalizeOriginUrl,
  parseOriginConfigFromEnv,
  parsePathPrefixes,
  shouldProxyToOrigin,
  shouldRequireAdmission,
  type OriginProxyConfig,
} from "../src/core/origin";
import { buildProxyTarget, buildUpstreamHeaders } from "../src/proxy/origin-proxy";

describe("origin proxy config", () => {
  it("normalizes absolute origins and rejects junk / private hosts", () => {
    expect(normalizeOriginUrl("https://shop.example.com/path")).toBe("https://shop.example.com");
    expect(normalizeOriginUrl("http://localhost:3000")).toBeNull();
    expect(normalizeOriginUrl("http://127.0.0.1")).toBeNull();
    expect(normalizeOriginUrl("http://10.0.0.5")).toBeNull();
    expect(normalizeOriginUrl("not-a-url")).toBeNull();
    expect(normalizeOriginUrl("")).toBeNull();
  });

  it("parses env into an enabled config", () => {
    const config = parseOriginConfigFromEnv({
      ORIGIN_URL: "https://origin.example.com",
      ORIGIN_PROTECT_ALL: "false",
      ORIGIN_PATH_PREFIXES: "/checkout,/account/",
      DEFAULT_QUEUE: "launch",
    });
    expect(config.enabled).toBe(true);
    expect(config.originUrl).toBe("https://origin.example.com");
    expect(config.protectAll).toBe(false);
    expect(config.pathPrefixes).toEqual(["/checkout", "/account"]);
    expect(config.queue).toBe("launch");
  });

  it("keeps TideGuard control paths reserved when proxy is on", () => {
    expect(isTideGuardPath("/wait", true)).toBe(true);
    expect(isTideGuardPath("/admin", true)).toBe(true);
    expect(isTideGuardPath("/admin/", true)).toBe(true);
    expect(isTideGuardPath("/admin/assets/index.js", true)).toBe(true);
    expect(isTideGuardPath("/api/admin/state", true)).toBe(true);
    expect(isTideGuardPath("/sounds/notification.mp3", true)).toBe(true);
    expect(isTideGuardPath("/", true)).toBe(false);
    expect(isTideGuardPath("/checkout", true)).toBe(false);
    expect(isTideGuardPath("/", false)).toBe(true);
  });

  it("requires admission for protected paths", () => {
    const all: OriginProxyConfig = {
      enabled: true,
      originUrl: "https://origin.example.com",
      protectAll: true,
      pathPrefixes: [],
      queue: "default",
    };
    expect(shouldRequireAdmission("/checkout", all)).toBe(true);
    expect(shouldRequireAdmission("/wait", all)).toBe(false);
    expect(shouldRequireAdmission("/sounds/notification.mp3", all)).toBe(false);

    const prefixes: OriginProxyConfig = {
      ...all,
      protectAll: false,
      pathPrefixes: ["/checkout"],
    };
    expect(shouldRequireAdmission("/checkout", prefixes)).toBe(true);
    expect(shouldRequireAdmission("/checkout/pay", prefixes)).toBe(true);
    expect(shouldRequireAdmission("/about", prefixes)).toBe(false);
    expect(shouldProxyToOrigin("/about", prefixes)).toBe(true);
  });

  it("merges KV overrides over env", () => {
    const env = parseOriginConfigFromEnv({
      ORIGIN_URL: "https://env.example.com",
      ORIGIN_PROTECT_ALL: "true",
    });
    const merged = mergeOriginConfig(env, {
      enabled: true,
      originUrl: "https://kv.example.com",
      protectAll: false,
      pathPrefixes: ["/app"],
    });
    expect(merged.originUrl).toBe("https://kv.example.com");
    expect(merged.protectAll).toBe(false);
    expect(merged.pathPrefixes).toEqual(["/app"]);
  });

  it("builds upstream URLs from the visitor path", () => {
    const upstream = buildUpstreamUrl(
      "https://origin.example.com",
      new URL("https://gate.example.com/checkout?sku=1"),
    );
    expect(upstream.toString()).toBe("https://origin.example.com/checkout?sku=1");
  });

  it("parses path prefix lists", () => {
    expect(parsePathPrefixes(" /a , /b/ ,nope")).toEqual(["/a", "/b"]);
  });
});

describe("origin proxy request shaping", () => {
  it("targets the origin host and forwards visitor metadata", () => {
    const config: OriginProxyConfig = {
      enabled: true,
      originUrl: "https://origin.example.com",
      protectAll: true,
      pathPrefixes: [],
      queue: "default",
    };
    const request = new Request("https://gate.example.com/shop/item?id=9", {
      headers: {
        cookie: "tg_access=token",
        "x-custom": "1",
        host: "gate.example.com",
      },
    });
    const target = buildProxyTarget(request, config);
    expect(target.url).toBe("https://origin.example.com/shop/item?id=9");

    const headers = buildUpstreamHeaders(
      request.headers,
      new URL(request.url),
      config.originUrl!,
      "visitor-1",
    );
    expect(headers.get("host")).toBe("origin.example.com");
    expect(headers.get("x-forwarded-host")).toBe("gate.example.com");
    expect(headers.get("x-tideguard-visitor")).toBe("visitor-1");
    expect(headers.get("x-custom")).toBe("1");
    expect(headers.get("cookie")).toBeNull();
  });

  it("forwards non-TideGuard cookies only", async () => {
    const { sanitizeCookieHeader } = await import("../src/proxy/origin-proxy");
    expect(sanitizeCookieHeader("tg_access=a; session=b; tg_ticket=c")).toBe("session=b");
    expect(sanitizeCookieHeader("tg_admin=x")).toBeNull();
  });
});
