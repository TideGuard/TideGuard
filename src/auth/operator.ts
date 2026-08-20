import { ApiError } from "../core/errors";
import { findUserById, readAdminConfig } from "../admin/store";
import { hasAcceptedCurrentTos, TOS_VERSION } from "../admin/tos";
import { TokenError } from "./token";
import { timingSafeEqual } from "./crypto";
import {
  type AdminActor,
  buildAdminSessionCookie,
  clearAdminSessionCookie,
  readAdminSessionCookie,
  verifyAdminSession,
} from "./admin-session";
import { requireAdminSessionSecret, requireOperatorSecret } from "./secrets";

export {
  requireAdmissionSecret,
  requireAdminSessionSecret,
  requireOperatorSecret,
  requireSealSecret,
  requireTokenSecret,
  hasDedicatedAdmissionSecret,
  hasDedicatedAdminSessionSecret,
  hasDedicatedSealSecret,
} from "./secrets";

/**
 * Operator gate for privileged routes.
 * Accepts an admin session cookie (ADMIN_SESSION_SECRET), or TOKEN_SECRET via
 * Bearer / X-TideGuard-Operator (bootstrap, CI, and emergency access).
 */
export async function requireOperator(request: Request, env: Env): Promise<void> {
  const session = readAdminSessionCookie(request);
  if (session) {
    try {
      await verifyAdminSession(session, requireAdminSessionSecret(env));
      return;
    } catch (error) {
      if (!(error instanceof TokenError)) {
        throw error;
      }
    }
  }

  const operatorSecret = requireOperatorSecret(env);
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const operatorHeader = request.headers.get("x-tideguard-operator");
  const provided = bearer || operatorHeader;

  if (!provided || !(await timingSafeEqual(provided, operatorSecret))) {
    throw new ApiError("unauthorized", "Operator authentication required", 401);
  }
}

export async function requireAdminSession(
  request: Request,
  env: Env,
  options?: { allowStaleTos?: boolean },
): Promise<AdminActor> {
  const secret = requireAdminSessionSecret(env);
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

export { buildAdminSessionCookie, clearAdminSessionCookie, readAdminSessionCookie };
export type { AdminActor };
