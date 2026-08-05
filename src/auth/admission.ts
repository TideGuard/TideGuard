/**
 * Validate an admission token from Authorization / query / cookie.
 */

import { ApiError } from "../core/errors";
import { extractAccessToken } from "./cookies";
import { requireTokenSecret } from "./operator";
import { TokenError, verifyAccessToken } from "./token";

export async function requireAdmission(
  request: Request,
  env: Env,
  expectedQueue?: string,
): Promise<{ visitorId: string; queue: string; token: string }> {
  const url = new URL(request.url);
  const token = extractAccessToken(request, url);
  if (!token) {
    throw new ApiError("unauthorized", "Missing access token", 401);
  }

  try {
    const claims = await verifyAccessToken(
      token,
      requireTokenSecret(env),
      expectedQueue ? { expectedQueue } : undefined,
    );
    return { visitorId: claims.sub, queue: claims.queue, token };
  } catch (error) {
    if (error instanceof TokenError) {
      throw new ApiError("unauthorized", error.message, 401, { reason: error.code });
    }
    throw error;
  }
}
