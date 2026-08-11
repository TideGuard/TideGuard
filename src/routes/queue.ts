import { requireOperator } from "../auth/operator";
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
} from "../auth";
import { ConfigError, parseAdmissionMode } from "../core/config";
import { ApiError, jsonOk } from "../core/errors";
import type { JoinResult, StatusResult } from "../core/types";
import { configFromEnv, getQueueRoom } from "../queue/client";
import { evaluateGeoBlock } from "../admin/geo-block";
import {
  parseOptionalCount,
  parseOptionalVisitorId,
  parseQueueName,
  parseRequiredVisitorId,
  readJsonBody,
  requireTokenSecret,
} from "./validation";

/** Ticket TTL covers max queue stay (24h default) + buffer so waiters can poll until admission. */
const TICKET_TTL_SECONDS = 60 * 60 * 26;

type VisitorView = {
  id: string;
  status: JoinResult["status"];
  position: number | null;
  estimatedWaitSeconds: number;
  admissionMode: JoinResult["admissionMode"];
  waiting: number;
  ahead: number | null;
  behind: number | null;
  lotteryOdds: number | null;
  admittedAt?: number | null;
  entered: boolean;
  holdSecondsRemaining: number | null;
  showWaitingCount?: boolean;
  nextPollAfterMs?: number | null;
  nextCheckAt?: number | null;
  admissionOpen?: boolean;
  opensAt?: number | null;
};

function visitorPayload(visitor: VisitorView, options?: { includeDepth?: boolean }) {
  const includeDepth = options?.includeDepth ?? Boolean(visitor.showWaitingCount);
  const base = {
    visitorId: visitor.id,
    status: visitor.status,
    position: visitor.position,
    estimatedWaitSeconds: visitor.estimatedWaitSeconds,
    admissionMode: visitor.admissionMode,
    entered: visitor.entered,
    admissionOpen: visitor.admissionOpen ?? true,
    ...(visitor.opensAt != null ? { opensAt: visitor.opensAt } : {}),
    ...(visitor.holdSecondsRemaining !== null
      ? { holdSecondsRemaining: visitor.holdSecondsRemaining }
      : {}),
    ...(visitor.nextPollAfterMs != null ? { nextPollAfterMs: visitor.nextPollAfterMs } : {}),
    ...(visitor.nextCheckAt != null ? { nextCheckAt: visitor.nextCheckAt } : {}),
  };
  if (!includeDepth) {
    return base;
  }
  return {
    ...base,
    waiting: visitor.waiting,
    ...(visitor.ahead !== null ? { ahead: visitor.ahead } : {}),
    ...(visitor.behind !== null ? { behind: visitor.behind } : {}),
    ...(visitor.lotteryOdds !== null ? { lotteryOdds: visitor.lotteryOdds } : {}),
  };
}

function canIssueAccessToken(visitor: VisitorView): boolean {
  return visitor.status === "admitted" && visitor.entered;
}

export async function handleJoin(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const secret = requireTokenSecret(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE || "default");

  const geo = await evaluateGeoBlock(request, env);
  if (geo.blocked) {
    throw new ApiError("forbidden", "Access is not available from your region", 403, {
      country: geo.country,
    });
  }

  let visitorId = parseOptionalVisitorId(body.visitorId);

  // Same-browser multi-tab: resume the ticket-bound visitor and ignore conflicting ids.
  const existingTicket = readTicketCookie(request);
  if (existingTicket) {
    try {
      const claims = await verifyVisitorTicket(existingTicket, secret, { expectedQueue: queue });
      visitorId = claims.sub;
    } catch {
      // Invalid/expired ticket — fall through to body / new id.
    }
  }

  const room = getQueueRoom(env, queue);
  let joined;
  try {
    joined = await room.join({
      queue,
      config,
      ...(visitorId ? { visitorId } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "queue_full" || message.includes("queue_full")) {
      throw new ApiError(
        "queue_full",
        "The waiting room is at capacity. Please try again later.",
        503,
      );
    }
    throw err;
  }

  const cookies: string[] = [];
  const ticket = await signVisitorTicket(
    { visitorId: joined.id, queue, ttlSeconds: TICKET_TTL_SECONDS },
    secret,
  );
  cookies.push(buildTicketCookie(ticket, request, TICKET_TTL_SECONDS));

  let accessToken: string | undefined;
  if (canIssueAccessToken(joined)) {
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

  const result: JoinResult = {
    ...visitorPayload(joined),
    ...(accessToken ? { accessToken } : {}),
  };

  return appendSetCookies(jsonOk(result, joined.status === "admitted" ? 200 : 202), cookies);
}

export async function handleStatus(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const config = loadConfig(env);
  const secret = requireTokenSecret(env);
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE || "default");
  const visitorId = parseRequiredVisitorId(url.searchParams.get("id"));

  await requireVisitorTicket(request, secret, visitorId, queue);

  const room = getQueueRoom(env, queue);
  const status = await room.status({ queue, config, visitorId });
  if (!status.ok) {
    throw new ApiError("not_found", "Visitor not found in this queue", 404);
  }

  const cookies: string[] = [];
  let accessToken: string | undefined;
  if (canIssueAccessToken(status.visitor)) {
    accessToken = await signAccessToken(
      buildAdmissionClaims({
        visitorId: status.visitor.id,
        queue,
        tokenTTLSeconds: config.tokenTTLSeconds,
        ...(status.visitor.admittedAt ? { nowMs: status.visitor.admittedAt } : {}),
      }),
      secret,
    );
    cookies.push(buildAccessCookie(accessToken, request, config.tokenTTLSeconds));
  }

  const result: StatusResult = {
    ...visitorPayload(status.visitor),
    ...(accessToken ? { accessToken } : {}),
  };

  return appendSetCookies(jsonOk(result), cookies);
}

export async function handleEnter(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const secret = requireTokenSecret(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE || "default");
  const visitorId = parseRequiredVisitorId(body.visitorId ?? body.id);

  await requireVisitorTicket(request, secret, visitorId, queue);

  const room = getQueueRoom(env, queue);
  const entered = await room.enter({ queue, config, visitorId });
  if (!entered.ok) {
    if (entered.code === "not_admitted") {
      throw new ApiError("conflict", "Visitor is not admitted yet", 409);
    }
    throw new ApiError("not_found", "Visitor not found in this queue", 404);
  }

  const accessToken = await signAccessToken(
    buildAdmissionClaims({
      visitorId: entered.visitor.id,
      queue,
      tokenTTLSeconds: config.tokenTTLSeconds,
      ...(entered.visitor.admittedAt ? { nowMs: entered.visitor.admittedAt } : {}),
    }),
    secret,
  );

  const result: StatusResult = {
    ...visitorPayload(entered.visitor),
    accessToken,
  };

  return appendSetCookies(jsonOk(result), [
    buildAccessCookie(accessToken, request, config.tokenTTLSeconds),
  ]);
}

export async function handleLeave(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const secret = requireTokenSecret(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE || "default");
  const visitorId = parseRequiredVisitorId(body.visitorId ?? body.id);

  await requireVisitorTicket(request, secret, visitorId, queue);

  const room = getQueueRoom(env, queue);
  const left = await room.leave({ queue, config, visitorId });
  return jsonOk(left);
}

export async function handleHeartbeat(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const secret = requireTokenSecret(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE || "default");
  const visitorId = parseRequiredVisitorId(body.visitorId ?? body.id);

  await requireVisitorTicket(request, secret, visitorId, queue);

  const room = getQueueRoom(env, queue);
  const beat = await room.heartbeat({ queue, config, visitorId });
  if (!beat.ok) {
    throw new ApiError("not_found", "Waiting visitor not found", 404);
  }

  return jsonOk({
    ...visitorPayload(beat.visitor),
    lastHeartbeatAt: beat.visitor.lastHeartbeatAt,
  });
}

export async function handleAdmit(request: Request, env: Env): Promise<Response> {
  await requireOperator(request, env);

  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE || "default");
  const count = parseOptionalCount(body.count, 1);

  const room = getQueueRoom(env, queue);
  const admitted = await room.forceAdmit({ queue, config, count });
  return jsonOk(admitted);
}

export async function handleMode(request: Request, env: Env): Promise<Response> {
  await requireOperator(request, env);

  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE || "default");
  const mode = parseAdmissionMode(body.mode);
  if (!mode) {
    throw new ApiError("bad_request", 'mode must be "queue" or "lottery"', 400);
  }

  const room = getQueueRoom(env, queue);
  const result = await room.setMode({ queue, config, mode });
  return jsonOk(result);
}

export async function handlePause(request: Request, env: Env): Promise<Response> {
  await requireOperator(request, env);

  const body = await readJsonBody(request);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE || "default");
  const paused = body.paused === true || body.paused === "true";

  const room = getQueueRoom(env, queue);
  return jsonOk(await room.setPaused(paused));
}

export async function handleMetrics(request: Request, env: Env): Promise<Response> {
  await requireOperator(request, env);

  const url = new URL(request.url);
  const config = loadConfig(env);
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE || "default");

  const room = getQueueRoom(env, queue);
  const metrics = await room.metrics({ queue, config });
  return jsonOk(metrics);
}

export { requireAdmission };

async function requireVisitorTicket(
  request: Request,
  secret: string,
  visitorId: string,
  queue: string,
): Promise<void> {
  const ticket = readTicketCookie(request);
  if (!ticket) {
    throw new ApiError("unauthorized", "Missing visitor ticket cookie", 401);
  }
  try {
    await verifyVisitorTicket(ticket, secret, {
      expectedVisitorId: visitorId,
      expectedQueue: queue,
    });
  } catch (error) {
    if (error instanceof TokenError) {
      throw new ApiError("unauthorized", error.message, 401, { reason: error.code });
    }
    throw error;
  }
}

function loadConfig(env: Env) {
  try {
    return configFromEnv(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new ApiError("invalid_config", error.message, 500, {
        issues: error.issues,
      });
    }
    throw error;
  }
}
