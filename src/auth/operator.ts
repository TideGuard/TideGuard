import { ApiError } from "../core/errors";
import { TokenError } from "./token";
import {
  type AdminActor,
  buildAdminSessionCookie,
  clearAdminSessionCookie,
  readAdminSessionCookie,
  verifyAdminSession,
} from "./admin-session";

/**
 * Operator gate for privileged routes.
 * Accepts an admin session cookie, or TOKEN_SECRET via Bearer / X-TideGuard-Operator
 * (bootstrap, CI, and emergency access).
 */
export async function requireOperator(request: Request, env: Env): Promise<void> {
  const secret = requireTokenSecret(env);

  const session = readAdminSessionCookie(request);
  if (session) {
    try {
      await verifyAdminSession(session, secret);
      return;
    } catch (error) {
      if (!(error instanceof TokenError)) {
        throw error;
      }
    }
  }

  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const operatorHeader = request.headers.get("x-tideguard-operator");
  const provided = bearer || operatorHeader;

  if (!provided || !(await timingSafeStringEqual(provided, secret))) {
    throw new ApiError("unauthorized", "Operator authentication required", 401);
  }
}

export async function requireAdminSession(request: Request, env: Env): Promise<AdminActor> {
  const secret = requireTokenSecret(env);
  const session = readAdminSessionCookie(request);
  if (!session) {
    throw new ApiError("unauthorized", "Admin session required", 401);
  }
  try {
    const claims = await verifyAdminSession(session, secret);
    return { id: claims.sub, username: claims.username };
  } catch (error) {
    if (error instanceof TokenError) {
      throw new ApiError("unauthorized", error.message, 401, { reason: error.code });
    }
    throw error;
  }
}

export function requireTokenSecret(env: Env): string {
  const secret = env.TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new ApiError(
      "invalid_config",
      "TOKEN_SECRET must be set to a random string of at least 16 characters",
      500,
    );
  }
  return secret;
}

export { buildAdminSessionCookie, clearAdminSessionCookie, readAdminSessionCookie };
export type { AdminActor };

async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}
