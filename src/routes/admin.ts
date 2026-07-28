import { parseAdmissionMode } from "../core/config";
import { ApiError, jsonOk } from "../core/errors";
import { DEFAULT_BRANDING, type WaitingRoomBranding } from "../core/branding";
import type { AdmissionMode } from "../core/types";
import { hashPassword, verifyPassword } from "../auth/password";
import { signAdminSession } from "../auth/admin-session";
import {
  buildAdminSessionCookie,
  clearAdminSessionCookie,
  requireAdminSession,
  requireTokenSecret,
} from "../auth/operator";
import {
  clearAdminConfig,
  isAdminSetupComplete,
  readAdminConfig,
  readBranding,
  sanitizeBrandingInput,
  writeAdminConfig,
  writeBranding,
} from "../admin/store";
import { renderAdminApp } from "../html/admin";
import { configFromEnv, getQueueRoom } from "../queue/client";
import { parseQueueName, readJsonBody } from "./validation";

export async function handleAdminPage(_request: Request, env: Env): Promise<Response> {
  const setupComplete = await isAdminSetupComplete(env);
  const html = renderAdminApp({
    setupComplete,
    defaultQueue: env.DEFAULT_QUEUE || "default",
    defaultBranding: DEFAULT_BRANDING,
  });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function handleAdminBootstrap(_request: Request, env: Env): Promise<Response> {
  return jsonOk({
    setupComplete: await isAdminSetupComplete(env),
    defaultQueue: env.DEFAULT_QUEUE || "default",
  });
}

export async function handleAdminSetup(request: Request, env: Env): Promise<Response> {
  if (await isAdminSetupComplete(env)) {
    throw new ApiError("conflict", "Admin setup is already complete", 409);
  }

  const body = await readJsonBody(request);
  const password = parsePassword(body.password);
  const confirm = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  if (password !== confirm) {
    throw new ApiError("bad_request", "Passwords do not match", 400);
  }

  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE);
  const mode = parseAdmissionMode(body.admissionMode ?? "queue");
  if (!mode) {
    throw new ApiError("bad_request", 'admissionMode must be "queue" or "lottery"', 400);
  }

  const branding = sanitizeBrandingInput(
    body.branding && typeof body.branding === "object"
      ? (body.branding as Partial<WaitingRoomBranding>)
      : undefined,
  );

  const { hash, salt } = await hashPassword(password);
  await writeAdminConfig(env, {
    setupComplete: true,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: Date.now(),
    defaultQueue: queue,
  });
  await writeBranding(env, queue, branding);

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  await room.setMode({ queue, config, mode });

  const session = await signAdminSession(requireTokenSecret(env));
  return withCookie(
    jsonOk({ ok: true, queue, admissionMode: mode }),
    buildAdminSessionCookie(session, request),
  );
}

export async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const password = parsePassword(body.password);
  const ok = await verifyPassword(password, admin.passwordHash, admin.passwordSalt);
  if (!ok) {
    throw new ApiError("unauthorized", "Invalid password", 401);
  }

  const session = await signAdminSession(requireTokenSecret(env));
  return withCookie(
    jsonOk({ ok: true, queue: admin.defaultQueue }),
    buildAdminSessionCookie(session, request),
  );
}

export async function handleAdminLogout(request: Request, _env: Env): Promise<Response> {
  return withCookie(jsonOk({ ok: true }), clearAdminSessionCookie(request));
}

export async function handleAdminState(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const queue = parseQueueName(
    new URL(request.url).searchParams.get("queue") ?? admin.defaultQueue,
    admin.defaultQueue,
  );
  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  const [branding, metrics] = await Promise.all([
    readBranding(env, queue),
    room.metrics({ queue, config }),
  ]);

  return jsonOk({
    queue,
    branding,
    metrics,
    admissionMode: metrics.admissionMode as AdmissionMode,
  });
}

export async function handleAdminSaveBranding(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const branding = sanitizeBrandingInput(
    body.branding && typeof body.branding === "object"
      ? (body.branding as Partial<WaitingRoomBranding>)
      : body,
  );
  await writeBranding(env, queue, branding);
  return jsonOk({ ok: true, queue, branding });
}

export async function handleAdminSetMode(request: Request, env: Env): Promise<Response> {
  await requireAdminSession(request, env);
  const admin = await readAdminConfig(env);
  if (!admin) {
    throw new ApiError("not_found", "Admin setup has not been completed", 404);
  }

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, admin.defaultQueue);
  const mode = parseAdmissionMode(body.mode);
  if (!mode) {
    throw new ApiError("bad_request", 'mode must be "queue" or "lottery"', 400);
  }

  const config = configFromEnv(env);
  const room = getQueueRoom(env, queue);
  return jsonOk(await room.setMode({ queue, config, mode }));
}

/** Emergency reset: TOKEN_SECRET bearer only (not session). Clears admin password. */
export async function handleAdminReset(request: Request, env: Env): Promise<Response> {
  const secret = requireTokenSecret(env);
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  if (!bearer || !(await timingSafeStringEqual(bearer, secret))) {
    throw new ApiError("unauthorized", "TOKEN_SECRET bearer required to reset admin", 401);
  }

  await clearAdminConfig(env);
  return jsonOk({ ok: true, setupComplete: false });
}

function parsePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new ApiError("bad_request", "password must be 8–128 characters", 400);
  }
  return value;
}

function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
