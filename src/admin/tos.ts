import type { AdminUser } from "./types";
import { GITHUB_REPO } from "../version";
import { ApiError } from "../core/errors";

/**
 * Operator Terms of Service version. Bump together with TERMS.md edits.
 * Admins with a lower or missing acceptedTosVersion must re-accept.
 */
export const TOS_VERSION = 1;

export const TOS_URL = `https://github.com/${GITHUB_REPO}/blob/main/TERMS.md`;

/** Short in-app summary shown on claim / invite / re-accept gates. */
export const TOS_SUMMARY = [
  "TideGuard is MIT-licensed open-source software provided as is, without warranty. You deploy and operate it on your own Cloudflare account.",
  "You are responsible for your secrets, configuration, invited admins, visitor-facing experience, and legal compliance for your events.",
  "The authors do not run your waiting room as a hosted service under these terms. Full text is linked below.",
].join("\n\n");

export function hasAcceptedCurrentTos(
  user: Pick<AdminUser, "acceptedTosVersion"> | null | undefined,
): boolean {
  return user?.acceptedTosVersion === TOS_VERSION;
}

export function readAcceptedTosVersion(
  user: Pick<AdminUser, "acceptedTosVersion"> | null | undefined,
): number | null {
  return typeof user?.acceptedTosVersion === "number" && Number.isFinite(user.acceptedTosVersion)
    ? user.acceptedTosVersion
    : null;
}

/**
 * Require `acceptedTosVersion` equal to the current `TOS_VERSION` on claim /
 * invite / tos/accept request bodies (explicit consent to that version).
 */
export function requireAcceptedTosVersion(body: Record<string, unknown>): void {
  if (body.acceptedTosVersion !== TOS_VERSION) {
    throw new ApiError(
      "bad_request",
      `You must accept the TideGuard Terms of Service version ${TOS_VERSION} (acceptedTosVersion: ${TOS_VERSION}) to continue.`,
      400,
      { tosVersion: TOS_VERSION },
    );
  }
}

export function tosPublicFields() {
  return {
    tosVersion: TOS_VERSION,
    tosSummary: TOS_SUMMARY,
    tosUrl: TOS_URL,
  };
}
