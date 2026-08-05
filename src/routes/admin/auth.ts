import { parseAdmissionMode } from "../../core/config";
import { ApiError, jsonOk } from "../../core/errors";
import type { WaitingRoomBranding } from "../../core/branding";
import { hashPassword, verifyPassword } from "../../auth/password";
import { assertAdminPassword } from "../../auth/password-policy";
import { createRecoveryVerifier } from "../../auth/recovery";
import { signAdminSession, verifyAdminSession } from "../../auth/admin-session";
import {
  buildAdminSessionCookie,
  clearAdminSessionCookie,
  readAdminSessionCookie,
  requireAdminSession,
  requireTokenSecret,
} from "../../auth/operator";
import { rateLimitOrThrow, withSecurityHeaders } from "../../auth";
import {
  findUserById,
  findUserByUsername,
  isAdminClaimed,
  isAdminSetupComplete,
  newAdminUserId,
  readAdminConfig,
  sanitizeBrandingInput,
  updateAdminUserAcceptedTos,
  writeAdminConfig,
  writeBranding,
} from "../../admin/store";
import { appendAuditEvent } from "../../admin/audit-store";
import { validateUsername } from "../../admin/types";
import {
  readAcceptedTosVersion,
  requireAcceptedTosVersion,
  tosPublicFields,
  TOS_VERSION,
} from "../../admin/tos";
import { writeCloudflareLink } from "../../admin/bypass-store";
import {
  clearSetupPending,
  isSetupPendingReady,
  openSetupPendingApiToken,
  openSetupPendingTurnstileSecret,
  readSetupPending,
  toSetupPendingPublic,
} from "../../admin/setup-pending-store";
import { readTurnstileSettings, writeTurnstileSettings } from "../../admin/turnstile-store";
import { configFromEnv, getQueueRoom } from "../../queue/client";
import { VERSION } from "../../version";
import { parseQueueName, readJsonBody } from "../validation";
import {
  clientKey,
  parsePassword,
  requireSetupBearer,
  requireTurnstileResponse,
  withCookie,
} from "./helpers";

export async function handleAdminPage(_request: Request, _env: Env): Promise<Response> {
  return withSecurityHeaders(
    new Response("Admin UI assets are missing. Run `npm run build:admin` then restart wrangler.", {
      status: 503,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    }),
  );
}

export async function handleAdminBootstrap(request: Request, env: Env): Promise<Response> {
  const admin = await readAdminConfig(env);
  const claimed = admin !== null;
  const setupComplete = admin?.setupComplete === true;
  const turnstile = await readTurnstileSettings(env);
  const pending = setupComplete ? null : await readSetupPending(env);

  let acceptedTosVersion: number | null = null;
  const session = readAdminSessionCookie(request);
  if (session && admin) {
    try {
      const claims = await verifyAdminSession(session, requireTokenSecret(env));
      const user = findUserById(admin, claims.sub);
      acceptedTosVersion = readAcceptedTosVersion(user);
    } catch {
      acceptedTosVersion = null;
    }
  }

  return jsonOk({
    setupComplete,
    claimed,
    claimedUsername: claimed ? (admin.users[0]?.username ?? null) : null,
    defaultQueue: admin?.defaultQueue || env.DEFAULT_QUEUE || "default",
    version: VERSION,
    turnstileSitekey: turnstile?.sitekey ?? pending?.turnstile?.sitekey ?? null,
    setupPending: pending ? toSetupPendingPublic(pending) : null,
    ...tosPublicFields(),
    acceptedTosVersion,
  });
}

/**
 * Step 1: lock in the first admin with TOKEN_SECRET bearer.
 * Issues a session; wizard continues as that user until Finish.
 */
export async function handleAdminClaim(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "claim"), { limit: 10, windowMs: 60_000 });

  if (await isAdminClaimed(env)) {
    throw new ApiError("conflict", "Admin has already been claimed", 409);
  }

  requireSetupBearer(request, env);

  const body = await readJsonBody(request);
  requireAcceptedTosVersion(body);
  let username: string;
  try {
    username = validateUsername(typeof body.username === "string" ? body.username : "");
  } catch (error) {
    throw new ApiError(
      "bad_request",
      error instanceof Error ? error.message : "Invalid username",
      400,
    );
  }
  let password: string;
  try {
    password = assertAdminPassword(body.password, body.confirmPassword);
  } catch (error) {
    throw new ApiError(
      "bad_request",
      error instanceof Error ? error.message : "Invalid password",
      400,
    );
  }
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE || "default");
  const { hash, salt } = await hashPassword(password);
  const recovery = await createRecoveryVerifier();
  const userId = newAdminUserId();
  const now = Date.now();
  await writeAdminConfig(env, {
    setupComplete: false,
    users: [
      {
        id: userId,
        username,
        passwordHash: hash,
        passwordSalt: salt,
        recoveryHash: recovery.hash,
        recoverySalt: recovery.salt,
        acceptedTosVersion: TOS_VERSION,
        createdAt: now,
      },
    ],
    createdAt: now,
    defaultQueue: queue,
  });

  const actor = { id: userId, username };
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "setup.claim",
    summary: `First admin “${username}” claimed the Worker`,
  });

  const session = await signAdminSession(requireTokenSecret(env), actor);
  return withCookie(
    jsonOk({
      ok: true,
      claimed: true,
      username,
      queue,
      recoveryMnemonic: recovery.mnemonic,
      acceptedTosVersion: TOS_VERSION,
      ...tosPublicFields(),
    }),
    buildAdminSessionCookie(session, request),
  );
}

/**
 * Finish wizard: promote pending Cloudflare + Turnstile, branding, and queue mode.
 * Requires an admin session from claim (not TOKEN_SECRET / password again).
 */
export async function handleAdminSetup(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "setup"), { limit: 10, windowMs: 60_000 });

  if (await isAdminSetupComplete(env)) {
    throw new ApiError("conflict", "Admin setup is already complete", 409);
  }

  const actor = await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("bad_request", "Claim the Worker before finishing setup", 400);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const mode = parseAdmissionMode(body.admissionMode ?? "queue");
  if (!mode) {
    throw new ApiError("bad_request", 'admissionMode must be "queue" or "lottery"', 400);
  }
  const branding = sanitizeBrandingInput(
    body.branding && typeof body.branding === "object"
      ? (body.branding as Partial<WaitingRoomBranding>)
      : undefined,
  );

  const pending = await readSetupPending(env);
  if (!isSetupPendingReady(pending) || !pending.cloudflare || !pending.turnstile) {
    throw new ApiError(
      "bad_request",
      "Finish Cloudflare verify (proxied DNS) and Turnstile verify before completing setup.",
      400,
    );
  }

  const apiToken = await openSetupPendingApiToken(env);
  const turnstileSecret = await openSetupPendingTurnstileSecret(env);
  if (!apiToken || !turnstileSecret) {
    throw new ApiError(
      "bad_request",
      "Setup pending secrets are missing; re-verify Cloudflare",
      400,
    );
  }

  await writeAdminConfig(env, {
    ...admin,
    setupComplete: true,
    defaultQueue: queue,
  });
  await writeBranding(env, queue, branding);
  await writeCloudflareLink(env, {
    zoneId: pending.cloudflare.zoneId,
    hostname: pending.cloudflare.hostname,
    apiToken,
    accountId: pending.cloudflare.accountId,
    workerService: pending.cloudflare.workerService,
  });
  await writeTurnstileSettings(env, {
    sitekey: pending.turnstile.sitekey,
    secret: turnstileSecret,
    accountId: pending.turnstile.accountId,
    domains: pending.turnstile.domains,
  });
  await clearSetupPending(env);

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  await room.setMode({ queue, config, mode });
  await room.setAdmitUx({
    queue,
    config,
    requireClickToEnter: branding.requireClickToEnter,
    admitHoldSeconds: branding.admitHoldSeconds,
    showWaitingCount: branding.showWaitingCount,
  });

  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "setup.complete",
    summary: `Admin “${actor.username}” finished first-time setup`,
  });

  return jsonOk({ ok: true, queue, admissionMode: mode, username: actor.username });
}

export async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "login"), { limit: 20, windowMs: 60_000 });

  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
  }

  const body = await readJsonBody(request);
  await requireTurnstileResponse(request, env, body);

  const usernameRaw = typeof body.username === "string" ? body.username : "";
  // Legacy installs / UI may omit username → treat as "admin".
  const username = usernameRaw.trim() ? usernameRaw : "admin";
  const user = findUserByUsername(admin, username);
  if (!user) {
    throw new ApiError("unauthorized", "Invalid username or password", 401);
  }
  const password = parsePassword(body.password);
  const ok = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!ok) {
    throw new ApiError("unauthorized", "Invalid username or password", 401);
  }

  const actor = { id: user.id, username: user.username };
  const session = await signAdminSession(requireTokenSecret(env), actor);
  return withCookie(
    jsonOk({
      ok: true,
      queue: admin.defaultQueue,
      username: user.username,
      acceptedTosVersion: readAcceptedTosVersion(user),
      ...tosPublicFields(),
    }),
    buildAdminSessionCookie(session, request),
  );
}

export async function handleAdminLogout(request: Request, _env: Env): Promise<Response> {
  return withCookie(jsonOk({ ok: true }), clearAdminSessionCookie(request));
}

/** Session may have stale ToS; stamps current TOS_VERSION on the signed-in user. */
export async function handleAdminTosAccept(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "tos-accept"), { limit: 20, windowMs: 60_000 });
  const actor = await requireAdminSession(request, env, { allowStaleTos: true });
  const body = await readJsonBody(request);
  requireAcceptedTosVersion(body);

  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
  }
  const user = findUserById(admin, actor.id);
  if (!user) {
    throw new ApiError("not_found", "User not found", 404);
  }

  await updateAdminUserAcceptedTos(env, actor.id, TOS_VERSION);
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "tos.accept",
    summary: `Accepted Terms of Service version ${TOS_VERSION}`,
    meta: { tosVersion: TOS_VERSION },
  });

  return jsonOk({
    ok: true,
    acceptedTosVersion: TOS_VERSION,
    ...tosPublicFields(),
  });
}
