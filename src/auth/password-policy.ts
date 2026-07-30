/**
 * Admin password creation policy (setup wizard + invite accept).
 * Login does not re-check these rules for existing hashes.
 */

export type AdminPasswordChecks = {
  length: boolean;
  upper: boolean;
  digitOrSymbol: boolean;
  match: boolean;
};

export function evaluateAdminPassword(password: string, confirm?: string): AdminPasswordChecks {
  const length = password.length >= 8 && password.length <= 128;
  const upper = /[A-Z]/.test(password);
  const digitOrSymbol = /[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password);
  const match = confirm === undefined ? true : password.length > 0 && password === confirm;
  return { length, upper, digitOrSymbol, match };
}

export function isAdminPasswordValid(checks: AdminPasswordChecks): boolean {
  return checks.length && checks.upper && checks.digitOrSymbol && checks.match;
}

/** Throws Error with operator-facing message when password fails policy. */
export function assertAdminPassword(password: unknown, confirm?: unknown): string {
  if (typeof password !== "string") {
    throw new Error(
      "Password must be 8–128 characters with an uppercase letter and a digit or symbol.",
    );
  }
  const confirmStr = typeof confirm === "string" ? confirm : undefined;
  if (confirm !== undefined && typeof confirm !== "string") {
    throw new Error("Passwords do not match.");
  }
  const checks = evaluateAdminPassword(password, confirmStr);
  if (!checks.length) {
    throw new Error("Password must be 8–128 characters.");
  }
  if (!checks.upper) {
    throw new Error("Password must include at least one uppercase letter.");
  }
  if (!checks.digitOrSymbol) {
    throw new Error("Password must include at least one digit or symbol.");
  }
  if (!checks.match) {
    throw new Error("Passwords do not match.");
  }
  return password;
}
