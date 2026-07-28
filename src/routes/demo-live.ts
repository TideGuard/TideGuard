import {
  appendSetCookies,
  buildAccessCookie,
  buildAdmissionClaims,
  buildTicketCookie,
  readTicketCookie,
  requireAdmission,
  signAccessToken,
  signVisitorTicket,
  TokenError,
  verifyVisitorTicket,
  withSecurityHeaders,
} from "../auth";
import { rateLimitOrThrow } from "../auth/rate-limit";
import { requireTokenSecret } from "../auth/operator";
import { ApiError, jsonOk } from "../core/errors";
import { DEFAULT_QUEUE_CONFIG } from "../core/config";
import type { QueueConfig } from "../core/types";
import { signDemoControllerToken, verifyDemoControllerToken } from "../demo/controller-token";
import { renderLiveDemoPage } from "../html/live-demo";
import { renderProtectedDemo } from "../demo/protected";
import {
  assertSessionActive,
  createDemoSessionId,
  DEMO_LIMITS,
  demoQueueName,
  parseSessionIdParam,
  readDemoSession,
  writeDemoSession,
  type DemoSessionRecord,
} from "../demo/session";
import { getQueueRoom } from "../queue/client";
import { parseOptionalVisitorId, parseRequiredVisitorId, readJsonBody } from "./validation";

const TICKET_TTL_SECONDS = 60 * 60;

export function handleLiveDemoPage(): Response {
  return withSecurityHeaders(
    new Response(renderLiveDemoPage(), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }),
  );
}

export async function handleDemoSessionCreate(request: Request, env: Env): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "demo-create"), {
    limit: DEMO_LIMITS.createPerIpPerMinute,
    windowMs: 60_000,
  });

  const secret = requireTokenSecret(env);
  const now = Date.now();
  const sessionId = await createDemoSessionId();
  const session: DemoSessionRecord = {
    sessionId,
    createdAt: now,
    expiresAt: now + DEMO_LIMITS.sessionTtlSeconds * 1000,
    generation: 0,
    admitPerSecond: DEMO_LIMITS.defaultAdmitPerSecond,
    paused: false,
    participantCount: 0,
  };
  await writeDemoSession(env, session);

  const queue = demoQueueName(session.sessionId, session.generation);
  const config = demoConfig(session);
  const room = getQueueRoom(env, queue);
  await room.setCapacity({
    queue,
    config,
    maxConcurrentUsers: DEMO_LIMITS.maxConcurrentUsers,
    admitPerSecond: session.admitPerSecond,
  });
  await room.setPaused(false);

  const controllerToken = await signDemoControllerToken(
    session.sessionId,
    secret,
    DEMO_LIMITS.sessionTtlSeconds,
    now,
  );

  return jsonOk({
    sessionId: session.sessionId,
    queue,
    expiresAt: session.expiresAt,
    admitPerSecond: session.admitPerSecond,
    maxParticipants: DEMO_LIMITS.maxParticipants,
    controllerToken,
    live: true,
    label: "Live demo — powered by a real TideGuard Worker and Durable Object.",
  });
}

export async function handleDemoJoin(
  request: Request,
  env: Env,
  sessionIdRaw: string,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "demo-join"), {
    limit: DEMO_LIMITS.joinPerIpPerMinute,
    windowMs: 60_000,
  });

  const sessionId = parseSessionIdParam(sessionIdRaw);
  const session = await requireActiveSession(env, sessionId);
  const secret = requireTokenSecret(env);
  const body = await readJsonBody(request);
  let visitorId = parseOptionalVisitorId(body.visitorId);

  const queue = demoQueueName(session.sessionId, session.generation);
  const existingTicket = readTicketCookie(request);
  if (existingTicket) {
    try {
      const claims = await verifyVisitorTicket(existingTicket, secret, { expectedQueue: queue });
      visitorId = claims.sub;
    } catch {
      // fall through
    }
  }

  if (!visitorId && session.participantCount >= DEMO_LIMITS.maxParticipants) {
    throw new ApiError("queue_full", "This demo session is full. Start a new demo.", 409);
  }

  const config = demoConfig(session);
  const room = getQueueRoom(env, queue);
  if (session.paused) {
    await room.setPaused(true);
  }

  const joined = await room.join({
    queue,
    config,
    ...(visitorId ? { visitorId } : {}),
  });

  if (!visitorId) {
    session.participantCount += 1;
    await writeDemoSession(env, session);
  }

  const cookies: string[] = [];
  const ticket = await signVisitorTicket(
    {
      visitorId: joined.id,
      queue,
      ttlSeconds: TICKET_TTL_SECONDS,
    },
    secret,
  );
  cookies.push(buildTicketCookie(ticket, request, TICKET_TTL_SECONDS));

  let accessToken: string | undefined;
  if (joined.status === "admitted" && joined.entered) {
    accessToken = await signAccessToken(
      buildAdmissionClaims({
        visitorId: joined.id,
        queue,
        tokenTTLSeconds: config.tokenTTLSeconds,
      }),
      secret,
    );
    cookies.push(buildAccessCookie(accessToken, request, config.tokenTTLSeconds));
  }

  const response = jsonOk({
    sessionId,
    queue,
    visitorId: joined.id,
    status: joined.status,
    position: joined.position,
    estimatedWaitSeconds: joined.estimatedWaitSeconds,
    waiting: joined.waiting,
    ahead: joined.ahead,
    behind: joined.behind,
    entered: joined.entered,
    paused: session.paused,
    ...(accessToken ? { accessToken } : {}),
  });
  return appendSetCookies(response, cookies);
}

export async function handleDemoStatus(
  request: Request,
  env: Env,
  sessionIdRaw: string,
): Promise<Response> {
  const sessionId = parseSessionIdParam(sessionIdRaw);
  const session = await requireActiveSession(env, sessionId);
  const secret = requireTokenSecret(env);
  const url = new URL(request.url);
  const visitorId = parseRequiredVisitorId(url.searchParams.get("visitorId"));
  const queue = demoQueueName(session.sessionId, session.generation);

  await assertTicket(request, secret, visitorId, queue);

  const config = demoConfig(session);
  const room = getQueueRoom(env, queue);
  const status = await room.status({ queue, config, visitorId });
  if (!status.ok) {
    throw new ApiError("not_found", "Visitor not found in this demo session", 404);
  }

  const cookies: string[] = [];
  let accessToken: string | undefined;
  if (status.visitor.status === "admitted" && status.visitor.entered) {
    accessToken = await signAccessToken(
      buildAdmissionClaims({
        visitorId,
        queue,
        tokenTTLSeconds: config.tokenTTLSeconds,
      }),
      secret,
    );
    cookies.push(buildAccessCookie(accessToken, request, config.tokenTTLSeconds));
  }

  const response = jsonOk({
    sessionId,
    queue,
    visitorId,
    status: status.visitor.status,
    position: status.visitor.position,
    estimatedWaitSeconds: status.visitor.estimatedWaitSeconds,
    waiting: status.visitor.waiting,
    ahead: status.visitor.ahead,
    behind: status.visitor.behind,
    entered: status.visitor.entered,
    paused: session.paused,
    updatedAt: Date.now(),
    ...(accessToken ? { accessToken } : {}),
  });
  return appendSetCookies(response, cookies);
}

export async function handleDemoHeartbeat(
  request: Request,
  env: Env,
  sessionIdRaw: string,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "demo-hb"), {
    limit: DEMO_LIMITS.mutatePerIpPerMinute,
    windowMs: 60_000,
  });
  const sessionId = parseSessionIdParam(sessionIdRaw);
  const session = await requireActiveSession(env, sessionId);
  const secret = requireTokenSecret(env);
  const body = await readJsonBody(request);
  const visitorId = parseRequiredVisitorId(body.visitorId);
  const queue = demoQueueName(session.sessionId, session.generation);
  await assertTicket(request, secret, visitorId, queue);

  const config = demoConfig(session);
  const room = getQueueRoom(env, queue);
  const result = await room.heartbeat({ queue, config, visitorId });
  if (!result.ok) {
    throw new ApiError("not_found", "Visitor not found in this demo session", 404);
  }
  return jsonOk({
    sessionId,
    visitorId,
    status: result.visitor.status,
    position: result.visitor.position,
    estimatedWaitSeconds: result.visitor.estimatedWaitSeconds,
    updatedAt: Date.now(),
  });
}

export async function handleDemoAdmit(
  request: Request,
  env: Env,
  sessionIdRaw: string,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "demo-admit"), {
    limit: DEMO_LIMITS.mutatePerIpPerMinute,
    windowMs: 60_000,
  });
  const sessionId = parseSessionIdParam(sessionIdRaw);
  const session = await requireActiveSession(env, sessionId);
  await requireDemoController(request, env, sessionId);

  const queue = demoQueueName(session.sessionId, session.generation);
  const config = demoConfig(session);
  const room = getQueueRoom(env, queue);
  const result = await room.forceAdmit({ queue, config, count: 1 });
  return jsonOk({
    sessionId,
    queue,
    admitted: result.admitted,
    waiting: result.waiting,
    openSlots: result.openSlots,
  });
}

export async function handleDemoPause(
  request: Request,
  env: Env,
  sessionIdRaw: string,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "demo-pause"), {
    limit: DEMO_LIMITS.mutatePerIpPerMinute,
    windowMs: 60_000,
  });
  const sessionId = parseSessionIdParam(sessionIdRaw);
  const session = await requireActiveSession(env, sessionId);
  await requireDemoController(request, env, sessionId);
  const body = await readJsonBody(request);
  const paused = body.paused === true || body.paused === "true";

  session.paused = paused;
  await writeDemoSession(env, session);

  const queue = demoQueueName(session.sessionId, session.generation);
  const room = getQueueRoom(env, queue);
  await room.setPaused(paused);
  return jsonOk({ sessionId, paused });
}

export async function handleDemoRate(
  request: Request,
  env: Env,
  sessionIdRaw: string,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "demo-rate"), {
    limit: DEMO_LIMITS.mutatePerIpPerMinute,
    windowMs: 60_000,
  });
  const sessionId = parseSessionIdParam(sessionIdRaw);
  const session = await requireActiveSession(env, sessionId);
  await requireDemoController(request, env, sessionId);
  const body = await readJsonBody(request);
  const rate = Number(body.admitPerSecond);
  if (
    !Number.isFinite(rate) ||
    rate < DEMO_LIMITS.minAdmitPerSecond ||
    rate > DEMO_LIMITS.maxAdmitPerSecond
  ) {
    throw new ApiError(
      "bad_request",
      `admitPerSecond must be between ${DEMO_LIMITS.minAdmitPerSecond} and ${DEMO_LIMITS.maxAdmitPerSecond}`,
      400,
    );
  }

  session.admitPerSecond = rate;
  await writeDemoSession(env, session);

  const queue = demoQueueName(session.sessionId, session.generation);
  const config = demoConfig(session);
  const room = getQueueRoom(env, queue);
  await room.setCapacity({
    queue,
    config,
    maxConcurrentUsers: DEMO_LIMITS.maxConcurrentUsers,
    admitPerSecond: rate,
  });
  return jsonOk({ sessionId, admitPerSecond: rate });
}

export async function handleDemoReset(
  request: Request,
  env: Env,
  sessionIdRaw: string,
): Promise<Response> {
  rateLimitOrThrow(clientKey(request, "demo-reset"), {
    limit: DEMO_LIMITS.mutatePerIpPerMinute,
    windowMs: 60_000,
  });
  const sessionId = parseSessionIdParam(sessionIdRaw);
  const session = await requireActiveSession(env, sessionId);
  await requireDemoController(request, env, sessionId);

  if (session.generation >= DEMO_LIMITS.maxResets) {
    throw new ApiError("bad_request", "Demo reset limit reached. Start a new demo session.", 400);
  }

  session.generation += 1;
  session.participantCount = 0;
  session.paused = false;
  await writeDemoSession(env, session);

  const queue = demoQueueName(session.sessionId, session.generation);
  const config = demoConfig(session);
  const room = getQueueRoom(env, queue);
  await room.setCapacity({
    queue,
    config,
    maxConcurrentUsers: DEMO_LIMITS.maxConcurrentUsers,
    admitPerSecond: session.admitPerSecond,
  });
  await room.setPaused(false);

  return jsonOk({
    sessionId,
    queue,
    generation: session.generation,
    reset: true,
  });
}

export async function handleDemoProtected(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = parseSessionIdParam(url.searchParams.get("session") ?? undefined);
  const session = await requireActiveSession(env, sessionId);
  const queue = demoQueueName(session.sessionId, session.generation);

  try {
    const admission = await requireAdmission(request, env, queue);
    const html = renderProtectedDemo({
      queueName: admission.queue,
      visitorId: admission.visitorId,
    });
    return withSecurityHeaders(
      new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === "unauthorized") {
      throw new ApiError(
        "unauthorized",
        "Valid admission token required for this demo protected page",
        401,
      );
    }
    throw error;
  }
}

async function requireActiveSession(env: Env, sessionId: string): Promise<DemoSessionRecord> {
  const session = await readDemoSession(env, sessionId);
  if (!session) {
    throw new ApiError("not_found", "Demo session not found", 404);
  }
  assertSessionActive(session);
  return session;
}

async function requireDemoController(request: Request, env: Env, sessionId: string): Promise<void> {
  const secret = requireTokenSecret(env);
  const header = request.headers.get("x-tideguard-demo-controller");
  const auth = request.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const token = header?.trim() || bearer;
  if (!token) {
    throw new ApiError("unauthorized", "Demo controller token required", 401);
  }
  try {
    await verifyDemoControllerToken(token, secret, sessionId);
  } catch (error) {
    if (error instanceof TokenError) {
      throw new ApiError("unauthorized", error.message, 401, { reason: error.code });
    }
    throw error;
  }
}

async function assertTicket(
  request: Request,
  secret: string,
  visitorId: string,
  queue: string,
): Promise<void> {
  const ticket = readTicketCookie(request);
  if (!ticket) {
    throw new ApiError("unauthorized", "Missing demo visitor ticket", 401);
  }
  try {
    await verifyVisitorTicket(ticket, secret, {
      expectedQueue: queue,
      expectedVisitorId: visitorId,
    });
  } catch (error) {
    if (error instanceof TokenError) {
      throw new ApiError("unauthorized", error.message, 401, { reason: error.code });
    }
    throw error;
  }
}

function demoConfig(session: DemoSessionRecord): QueueConfig {
  return {
    ...DEFAULT_QUEUE_CONFIG,
    maxConcurrentUsers: DEMO_LIMITS.maxConcurrentUsers,
    admitPerSecond: session.admitPerSecond,
    admissionMode: "queue",
    requireClickToEnter: false,
    admitHoldSeconds: 120,
    tokenTTLSeconds: 600,
    heartbeatTimeoutSeconds: 60,
    queueTimeoutSeconds: 1800,
  };
}

function clientKey(request: Request, action: string): string {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `${action}:${ip}`;
}

/** Match `/api/demo/:sessionId/...` paths. */
export function matchDemoApiPath(pathname: string): { sessionId: string; action: string } | null {
  const match = /^\/api\/demo\/([a-f0-9]{16,32})\/([a-z-]+)$/i.exec(pathname);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return { sessionId: match[1], action: match[2] };
}
