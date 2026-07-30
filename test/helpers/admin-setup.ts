import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";
import { seedSetupPendingForTests } from "../../src/admin/setup-pending-store";
import { TURNSTILE_TEST_PASS_SECRET } from "../../src/admin/cloudflare-api";

export const ADMIN_SECRET = "test-token-secret-do-not-use-in-production";

export function cookieFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length > 0) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  const single = response.headers.get("set-cookie");
  return single ? single.split(";")[0]! : "";
}

export async function resetAdmin(): Promise<void> {
  await exports.default.fetch(
    new Request("https://example.com/api/admin/reset", {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }),
  );
}

export const ADMIN_PASSWORD = "Correct-horse1";

/** Claim the Worker (step 1); returns session cookie. */
export async function claimAdmin(username = "ops", password = ADMIN_PASSWORD): Promise<string> {
  const claim = await exports.default.fetch(
    new Request("https://example.com/api/admin/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        username,
        password,
        confirmPassword: password,
        queue: "default",
      }),
    }),
  );
  expect(claim.status).toBe(200);
  return cookieFrom(claim);
}

/** Seeds Cloudflare+Turnstile pending state, claims, then finishes first-run setup. */
export async function setupAdmin(
  username = "ops",
  password = ADMIN_PASSWORD,
  extras?: Record<string, unknown>,
): Promise<string> {
  await seedSetupPendingForTests(env);
  const sessionCookie = await claimAdmin(username, password);
  const setup = await exports.default.fetch(
    new Request("https://example.com/api/admin/setup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        queue: "default",
        admissionMode: "queue",
        ...extras,
      }),
    }),
  );
  expect(setup.status).toBe(200);
  return sessionCookie;
}

/** Always-pass test Turnstile token body field (secret short-circuits siteverify). */
export function turnstileBody(): { turnstileToken: string } {
  return { turnstileToken: "test-turnstile-token" };
}

export { TURNSTILE_TEST_PASS_SECRET, seedSetupPendingForTests };
