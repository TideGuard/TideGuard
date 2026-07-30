import { describe, expect, it } from "vitest";
import { CloudflareApiError } from "../src/admin/cloudflare-api";
import {
  formatCloudflareOperatorError,
  formatTurnstileOperatorError,
} from "../src/admin/operator-errors";

describe("formatCloudflareOperatorError", () => {
  it("maps inactive / auth token failures", () => {
    expect(
      formatCloudflareOperatorError(
        new CloudflareApiError("Cloudflare API token is not active", 401),
      ),
    ).toMatch(/invalid or inactive/i);
  });

  it("maps permission failures", () => {
    expect(
      formatCloudflareOperatorError(
        new CloudflareApiError("Authentication error [code: 10000]", 403),
      ),
    ).toMatch(/permission/i);
  });

  it("maps missing worker service", () => {
    expect(formatCloudflareOperatorError(new CloudflareApiError("Script not found", 404))).toMatch(
      /Worker service not found/i,
    );
  });

  it("prefixes short readable Cloudflare messages", () => {
    expect(formatCloudflareOperatorError(new CloudflareApiError("Rate limited", 429))).toBe(
      "Cloudflare: Rate limited",
    );
  });
});

describe("formatTurnstileOperatorError", () => {
  it("maps known siteverify codes", () => {
    expect(formatTurnstileOperatorError(["timeout-or-duplicate"])).toMatch(
      /timed out|already used/i,
    );
    expect(formatTurnstileOperatorError(["missing-input-response"])).toMatch(
      /Complete the Turnstile/i,
    );
  });

  it("falls back with code list", () => {
    expect(formatTurnstileOperatorError(["weird-code"])).toContain("weird-code");
  });

  it("handles empty codes", () => {
    expect(formatTurnstileOperatorError([])).toMatch(/verification failed/i);
  });
});
