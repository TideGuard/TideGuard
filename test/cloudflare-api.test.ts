import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CloudflareApiError,
  checkHostnameProxy,
  findZoneIdByHostname,
  getZone,
  setSslMode,
  verifyApiToken,
} from "../src/admin/cloudflare-api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("cloudflare-api", () => {
  it("verifyApiToken accepts an active token", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        success: true,
        result: { id: "tok-1", status: "active" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyApiToken("cf-token")).resolves.toEqual({
      status: "active",
      id: "tok-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer cf-token",
        }),
      }),
    );
  });

  it("verifyApiToken maps inactive tokens to CloudflareApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          success: true,
          result: { id: "tok-1", status: "disabled" },
        }),
      ),
    );

    await expect(verifyApiToken("cf-token")).rejects.toMatchObject({
      name: "CloudflareApiError",
      status: 401,
    });
  });

  it("getZone returns zone metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          success: true,
          result: {
            id: "zone-1",
            name: "example.com",
            status: "active",
            account: { id: "acct-1" },
          },
        }),
      ),
    );

    await expect(getZone("cf-token", "zone-1")).resolves.toEqual({
      zoneId: "zone-1",
      zoneName: "example.com",
      accountId: "acct-1",
      status: "active",
    });
  });

  it("findZoneIdByHostname returns the matching zone id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(String(url));
        const name = u.searchParams.get("name");
        if (name === "example.com") {
          return jsonResponse({
            success: true,
            result: [{ id: "zone-abc", name: "example.com" }],
          });
        }
        return jsonResponse({ success: true, result: [] });
      }),
    );

    await expect(findZoneIdByHostname("cf-token", "shop.example.com")).resolves.toBe("zone-abc");
  });

  it("checkHostnameProxy reports missing DNS records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/dns_records")) {
          return jsonResponse({ success: true, result: [] });
        }
        if (String(url).includes("/ip_geolocation")) {
          return jsonResponse({
            success: true,
            result: { id: "ip_geolocation", value: "on", editable: true },
          });
        }
        return jsonResponse({ success: false, errors: [{ message: "unexpected" }] }, 500);
      }),
    );

    const result = await checkHostnameProxy({
      apiToken: "cf-token",
      zoneId: "zone-1",
      hostname: "shop.example.com",
    });
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/No DNS/i);
    expect(result.ipGeolocation).toEqual({ on: true });
  });

  it("setSslMode patches the zone SSL setting", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ success: true, result: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await setSslMode("cf-token", "zone-1", "strict");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone-1/settings/ssl",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ value: "strict" }),
      }),
    );
  });

  it("surfaces Cloudflare API error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            success: false,
            errors: [{ message: "Authentication error" }],
          },
          401,
        ),
      ),
    );

    const err = await verifyApiToken("bad").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CloudflareApiError);
    expect(err).toMatchObject({ message: expect.stringMatching(/Authentication error/) });
  });
});
