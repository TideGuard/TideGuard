import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_RULES,
  evaluateRoomRuleBypass,
  parseRoomRules,
} from "../src/admin/room-rules-store";

describe("waiting-room rules", () => {
  it("defaults closed and sanitizes names", () => {
    expect(parseRoomRules(null)).toEqual(DEFAULT_ROOM_RULES);
    expect(parseRoomRules({ cookieBypassName: "bad name" }).cookieBypassName).toBe("");
  });

  it("evaluates crawler, cookie, and header bypasses", () => {
    expect(
      evaluateRoomRuleBypass(
        new Request("https://example.com", { headers: { "user-agent": "Googlebot/2.1" } }),
        { ...DEFAULT_ROOM_RULES, seoCrawlerBypass: true },
      ),
    ).toBe("seo_crawler");

    expect(
      evaluateRoomRuleBypass(
        new Request("https://example.com", { headers: { cookie: "other=1; trusted=yes" } }),
        { ...DEFAULT_ROOM_RULES, cookieBypassName: "trusted" },
      ),
    ).toBe("cookie");

    expect(
      evaluateRoomRuleBypass(
        new Request("https://example.com", { headers: { "x-bypass": "secret" } }),
        {
          ...DEFAULT_ROOM_RULES,
          headerBypassName: "x-bypass",
          headerBypassValue: "secret",
        },
      ),
    ).toBe("header");
  });
});
