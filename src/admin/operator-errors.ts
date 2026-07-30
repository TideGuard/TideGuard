import type { CloudflareApiError } from "./cloudflare-api";

/**
 * Map Cloudflare API failures to short operator guidance for /admin setup.
 */
export function formatCloudflareOperatorError(error: CloudflareApiError): string {
  const raw = (error.message || "").trim();
  const lower = raw.toLowerCase();
  const status = error.status;

  if (
    status === 401 ||
    lower.includes("not active") ||
    lower.includes("authentication error") ||
    lower.includes("invalid request headers") ||
    lower.includes("unable to authenticate")
  ) {
    return "Cloudflare API token is invalid or inactive. Create a new token with the permissions listed in this step.";
  }

  if (
    status === 403 ||
    lower.includes("permission") ||
    lower.includes("not authorized") ||
    lower.includes("access denied") ||
    lower.includes("forbidden")
  ) {
    return "Cloudflare API token is missing a required permission. Recreate it with Zone DNS Edit, Zone Read, Zone Settings Edit, Turnstile Edit, and Workers Scripts Write.";
  }

  if (
    lower.includes("zone not found") ||
    lower.includes("invalid zone") ||
    lower.includes("could not find zone") ||
    (status === 404 && lower.includes("zone"))
  ) {
    return "Zone ID looks wrong or this token cannot read that zone. Copy Zone ID from the zone Overview page.";
  }

  if (
    lower.includes("script not found") ||
    lower.includes("worker not found") ||
    lower.includes("service not found") ||
    (lower.includes("does not exist") && lower.includes("worker"))
  ) {
    return "Worker service not found. Check the Worker service name (default tideguard) matches Workers & Pages.";
  }

  if (
    lower.includes("already exists") &&
    (lower.includes("domain") || lower.includes("hostname"))
  ) {
    return "That hostname is already attached to a Worker. Remove it elsewhere or use a different hostname.";
  }

  if (lower.includes("non-json")) {
    return "Cloudflare API returned an unexpected response. Check your network and try again.";
  }

  if (!raw || lower.startsWith("cloudflare api error")) {
    return `Cloudflare API error (${status}). Check the token permissions and try again.`;
  }

  // Keep Cloudflare's detail when it is already readable; prefix for context.
  if (raw.length <= 180) {
    return `Cloudflare: ${raw}`;
  }
  return `Cloudflare: ${raw.slice(0, 177)}…`;
}

const TURNSTILE_CODE_MESSAGES: Record<string, string> = {
  "missing-input-secret": "Turnstile secret is missing — create the widget again.",
  "invalid-input-secret": "Turnstile secret is invalid — create the widget again in this wizard.",
  "missing-input-response": "Complete the Turnstile challenge first.",
  "invalid-input-response":
    "Challenge expired or invalid — complete it again, then Click to verify.",
  "bad-request": "Turnstile rejected the request — refresh the widget and try again.",
  "timeout-or-duplicate": "Challenge already used or timed out — refresh the widget and try again.",
  "internal-error": "Turnstile could not be reached — try again in a moment.",
  "hostname-mismatch":
    "Challenge hostname does not match this site — check widget domains include localhost for npm run dev.",
};

/**
 * Map Turnstile siteverify error-codes to a single operator-facing message.
 */
export function formatTurnstileOperatorError(errorCodes: string[]): string {
  const codes = errorCodes.filter(Boolean);
  if (codes.length === 0) {
    return "Turnstile verification failed — complete the challenge and try again.";
  }
  for (const code of codes) {
    const mapped = TURNSTILE_CODE_MESSAGES[code];
    if (mapped) return mapped;
  }
  return `Turnstile verification failed (${codes.join(", ")}). Refresh the widget and try again.`;
}
