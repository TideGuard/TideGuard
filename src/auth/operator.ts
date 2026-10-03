import { ApiError } from "../core/errors";
import { findUserById, readAdminConfig } from "../admin/store";
import { hasAcceptedCurrentTos, TOS_VERSION } from "../admin/tos";
import { TokenError } from "./token";
import { timingSafeEqual } from "./crypto";
import { adminSecret, visitorSecret } from "./secrets";
import {
  type AdminActor,
  buildAdminSessionCookie,
  clearAdminSessionCookie,
  readAdminSessionCookie,
  verifyAdminSession,
} from "./admin-session";

/**
 * Operator gate for privileged routes.
 * Accepts an admin session cookie, or ADMIN_SECRET (falling back to TOKEN_SECRET)
 * via Bearer / X-TideGuard-Operator.
 */
export async function requireOperator(request: Request, env: Env): Promise<void> {
  const secret = adminSecret(env);

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

  if (!provided || !(await timingSafeEqual(provided, secret))) {
    throw new ApiError("unauthorized", "Operator authentication required", 401);
  }
}

export async function requireAdminSession(
  request: Request,
  env: Env,
  options?: { allowStaleTos?: boolean },
): Promise<AdminActor> {
  const secret = adminSecret(env);
  const session = readAdminSessionCookie(request);
  if (!session) {
    throw new ApiError("unauthorized", "Admin session required", 401);
  }
  let actor: AdminActor;
  try {
    const claims = await verifyAdminSession(session, secret);
    actor = { id: claims.sub, username: claims.username };
  } catch (error) {
    if (error instanceof TokenError) {
      throw new ApiError("unauthorized", error.message, 401, { reason: error.code });
    }
    throw error;
  }

  if (!options?.allowStaleTos) {
    const admin = await readAdminConfig(env);
    const user = admin ? findUserById(admin, actor.id) : null;
    if (!hasAcceptedCurrentTos(user)) {
      throw new ApiError("tos_required", "Accept the current Terms of Service to continue.", 403, {
        tosVersion: TOS_VERSION,
      });
    }
  }

  return actor;
}

/** Visitor-facing TOKEN_SECRET (admission HMAC). Prefer visitorSecret() in new code. */
export function requireTokenSecret(env: Env): string {
  return visitorSecret(env);
}

export { buildAdminSessionCookie, clearAdminSessionCookie, readAdminSessionCookie };
export type { AdminActor };
