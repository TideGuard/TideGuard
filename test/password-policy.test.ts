import { describe, expect, it } from "vitest";
import {
  assertAdminPassword,
  evaluateAdminPassword,
  isAdminPasswordValid,
} from "../src/auth/password-policy";

describe("admin password policy", () => {
  it("requires length, uppercase, and digit or symbol", () => {
    expect(isAdminPasswordValid(evaluateAdminPassword("short", "short"))).toBe(false);
    expect(isAdminPasswordValid(evaluateAdminPassword("alllowercase1", "alllowercase1"))).toBe(
      false,
    );
    expect(isAdminPasswordValid(evaluateAdminPassword("NoDigitOrSym", "NoDigitOrSym"))).toBe(false);
    expect(isAdminPasswordValid(evaluateAdminPassword("Correct-horse1", "Correct-horse1"))).toBe(
      true,
    );
    expect(isAdminPasswordValid(evaluateAdminPassword("CorrectHorse!", "CorrectHorse!"))).toBe(
      true,
    );
  });

  it("requires matching confirm when provided", () => {
    const checks = evaluateAdminPassword("Correct-horse1", "Correct-horse2");
    expect(checks.match).toBe(false);
    expect(isAdminPasswordValid(checks)).toBe(false);
  });

  it("assertAdminPassword throws specific messages", () => {
    expect(() => assertAdminPassword("tiny")).toThrow(/8–128/);
    expect(() => assertAdminPassword("nouppercase1")).toThrow(/uppercase/);
    expect(() => assertAdminPassword("NoSymbolOrDigit")).toThrow(/digit or symbol/);
    expect(() => assertAdminPassword("Correct-horse1", "Other-pass1")).toThrow(/do not match/);
    expect(assertAdminPassword("Correct-horse1", "Correct-horse1")).toBe("Correct-horse1");
  });
});
