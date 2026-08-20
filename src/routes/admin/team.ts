import { ApiError, jsonOk } from "../../core/errors";
import { hashPassword, verifyPassword } from "../../auth/password";
import { assertAdminPassword } from "../../auth/password-policy";
import { createRecoveryVerifier, verifyRecoveryMnemonic } from "../../auth/recovery";
import { signAdminSession } from "../../auth/admin-session";
import {
  buildAdminSessionCookie,
  requireAdminSession,
  requireAdminSessionSecret,
} from "../../auth/operator";
import { rateLimitOrThrow } from "../../auth";
import {
  addAdminUser,
  findUserById,
  findUserByUsername,
  isAdminSetupComplete,
  newAdminUserId,
  readAdminConfig,
  removeAdminUser,
  updateAdminUserPassword,
  updateAdminUserRecovery,
} from "../../admin/store";
import { appendAuditEvent } from "../../admin/audit-store";
import {
  InviteError,
  consumeInvite,
  createInvite,
  listInvites,
  revokeInvite,
  toPublicInvite,
} from "../../admin/invite-store";
import { validateUsername } from "../../admin/types";
import {
  requireAcceptedTosVersion,
  TOS_VERSION,
  tosPublicFields,
  readAcceptedTosVersion,
} from "../../admin/tos";
import { readJsonBody } from "../validation";
import { clientKey, parsePassword, requireTurnstileResponse, withCookie } from "./helpers";

export async function handleAdminListInvites(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const invites = await listInvites(env);
  return jsonOk({ invites: invites.map(toPublicInvite) });
}

export async function handleAdminCreateInvite(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  rateLimitOrThrow(clientKey(request, "invite-create"), { limit: 20, windowMs: 60_000 });
  const { invite, token, acceptPath } = await createInvite(env, actor);
  const acceptUrl = new URL(acceptPath, request.url).toString();
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "invite.create",
    summary: `Created admin invite (expires ${new Date(invite.expiresAt).toISOString()})`,
    meta: { inviteId: invite.id },
  });
  return jsonOk({
    ok: true,
    invite: toPublicInvite(invite),
    token: `${invite.id}.${token}`,
    acceptUrl,
  });
}

export async function handleAdminRevokeInvite(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  const id = new URL(request.url).pathname.split("/").pop() || "";
  if (!id || id === "invites") {
    throw new ApiError("bad_request", "Invite id required", 400);
  }
  const removed = await revokeInvite(env, id);
  if (!removed) {
    throw new ApiError("not_found", "Invite not found", 404);
  }
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "invite.revoke",
    summary: `Revoked admin invite ${id}`,
    meta: { inviteId: id },
  });
  return jsonOk({ ok: true });
}

export async function handleAdminAcceptInvite(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "invite-accept"), { limit: 20, windowMs: 60_000 });

  if (!(await isAdminSetupComplete(env))) {
    throw new ApiError("bad_request", "Finish first-time setup before accepting invites", 400);
  }

  const body = await readJsonBody(request);
  await requireTurnstileResponse(request, env, body);
  requireAcceptedTosVersion(body);
  const rawToken = typeof body.token === "string" ? body.token : "";
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

  let invite;
  try {
    invite = await consumeInvite(env, rawToken);
  } catch (error) {
    if (error instanceof InviteError) {
      throw new ApiError("bad_request", error.message, 400);
    }
    throw error;
  }

  const { hash, salt } = await hashPassword(password);
  const recovery = await createRecoveryVerifier();
  const userId = newAdminUserId();
  try {
    await addAdminUser(env, {
      id: userId,
      username,
      passwordHash: hash,
      passwordSalt: salt,
      recoveryHash: recovery.hash,
      recoverySalt: recovery.salt,
      acceptedTosVersion: TOS_VERSION,
      createdAt: Date.now(),
    });
  } catch (error) {
    throw new ApiError(
      "bad_request",
      error instanceof Error ? error.message : "Could not add user",
      400,
    );
  }

  const actor = { id: userId, username };
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "invite.accept",
    summary: `“${username}” joined via invite from ${invite.createdByUsername}`,
    meta: { inviteId: invite.id },
  });

  const admin = await readAdminConfig(env);
  const session = await signAdminSession(requireAdminSessionSecret(env), actor);
  return withCookie(
    jsonOk({
      ok: true,
      username,
      queue: admin?.defaultQueue ?? "default",
      recoveryMnemonic: recovery.mnemonic,
      acceptedTosVersion: TOS_VERSION,
      ...tosPublicFields(),
    }),
    buildAdminSessionCookie(session, request),
  );
}

export async function handleAdminChangePassword(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  rateLimitOrThrow(clientKey(request, "password-change"), { limit: 20, windowMs: 60_000 });
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
  }
  const user = findUserById(admin, actor.id);
  if (!user) {
    throw new ApiError("not_found", "User not found", 404);
  }

  const body = await readJsonBody(request);
  const currentPassword = parsePassword(body.currentPassword);
  const ok = await verifyPassword(currentPassword, user.passwordHash, user.passwordSalt);
  if (!ok) {
    throw new ApiError("unauthorized", "Current password is incorrect", 401);
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

  const { hash, salt } = await hashPassword(password);
  await updateAdminUserPassword(env, actor.id, hash, salt);
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "password.change",
    summary: "Changed own password",
  });
  return jsonOk({ ok: true });
}

/** Public: reset password with BIP39 phrase + Turnstile (after setup). */
export async function handleAdminPasswordRecover(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "password-recover"), { limit: 10, windowMs: 60_000 });

  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
  }

  const body = await readJsonBody(request);
  await requireTurnstileResponse(request, env, body);

  const usernameRaw = typeof body.username === "string" ? body.username : "";
  const username = usernameRaw.trim() ? usernameRaw : "admin";
  const user = findUserByUsername(admin, username);
  if (!user?.recoveryHash || !user.recoverySalt) {
    throw new ApiError("unauthorized", "Invalid username or recovery phrase", 401);
  }

  const mnemonic = typeof body.mnemonic === "string" ? body.mnemonic : "";
  const phraseOk = await verifyRecoveryMnemonic(mnemonic, user.recoveryHash, user.recoverySalt);
  if (!phraseOk) {
    throw new ApiError("unauthorized", "Invalid username or recovery phrase", 401);
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

  const { hash, salt } = await hashPassword(password);
  await updateAdminUserPassword(env, user.id, hash, salt);
  await appendAuditEvent(env, {
    actorId: user.id,
    actorUsername: user.username,
    action: "password.recover",
    summary: "Reset password with recovery phrase",
  });

  const actor = { id: user.id, username: user.username };
  const session = await signAdminSession(requireAdminSessionSecret(env), actor);
  return withCookie(
    jsonOk({
      ok: true,
      username: user.username,
      acceptedTosVersion: readAcceptedTosVersion(user),
      ...tosPublicFields(),
    }),
    buildAdminSessionCookie(session, request),
  );
}

/** Session: regenerate BIP39 phrase (invalidates old). Requires current password. */
export async function handleAdminRecoveryRegenerate(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  rateLimitOrThrow(clientKey(request, "recovery-regenerate"), { limit: 10, windowMs: 60_000 });
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
  }
  const user = findUserById(admin, actor.id);
  if (!user) {
    throw new ApiError("not_found", "User not found", 404);
  }

  const body = await readJsonBody(request);
  const currentPassword = parsePassword(body.currentPassword);
  const ok = await verifyPassword(currentPassword, user.passwordHash, user.passwordSalt);
  if (!ok) {
    throw new ApiError("unauthorized", "Current password is incorrect", 401);
  }

  const recovery = await createRecoveryVerifier();
  await updateAdminUserRecovery(env, actor.id, recovery.hash, recovery.salt);
  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "recovery.regenerate",
    summary: "Regenerated recovery phrase",
  });
  return jsonOk({ ok: true, recoveryMnemonic: recovery.mnemonic });
}

export async function handleAdminRemoveUser(request: Request, env: Env): Promise<Response> {
  const actor = await requireAdminSession(request, env);
  rateLimitOrThrow(clientKey(request, "user-remove"), { limit: 20, windowMs: 60_000 });
  const id = new URL(request.url).pathname.split("/").pop() || "";
  if (!id || id === "users") {
    throw new ApiError("bad_request", "User id required", 400);
  }

  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin has not been claimed yet", 404);
  }
  const target = findUserById(admin, id);
  if (!target) {
    throw new ApiError("not_found", "User not found", 404);
  }

  try {
    await removeAdminUser(env, id, actor.id);
  } catch (error) {
    throw new ApiError(
      "bad_request",
      error instanceof Error ? error.message : "Could not remove user",
      400,
    );
  }

  await appendAuditEvent(env, {
    actorId: actor.id,
    actorUsername: actor.username,
    action: "user.remove",
    summary: `Removed admin “${target.username}”`,
    meta: { userId: id },
  });
  return jsonOk({ ok: true });
}
