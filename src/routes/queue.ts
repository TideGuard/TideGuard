import { requireOperator } from "../auth/operator";
import { buildAdmissionClaims, signAccessToken, verifyAccessToken, TokenError } from "../auth";
import { ConfigError, parseAdmissionMode } from "../core/config";
import { ApiError, jsonOk } from "../core/errors";
import type { JoinResult, StatusResult } from "../core/types";
import { configFromEnv, getQueueRoom } from "../queue/client";
import {
  extractAccessToken,
  parseOptionalCount,
  parseOptionalVisitorId,
  parseQueueName,
  parseRequiredVisitorId,
  readJsonBody,
  requireTokenSecret,
} from "./validation";

function visitorPayload(visitor: {
  id: string;
  status: JoinResult["status"];
  position: number | null;
  estimatedWaitSeconds: number;
  admissionMode: JoinResult["admissionMode"];
  waiting: number;
  ahead: number | null;
  behind: number | null;
  lotteryOdds: number | null;
}) {
  return {
    visitorId: visitor.id,
    status: visitor.status,
    position: visitor.position,
    estimatedWaitSeconds: visitor.estimatedWaitSeconds,
    admissionMode: visitor.admissionMode,
    waiting: visitor.waiting,
    ...(visitor.ahead !== null ? { ahead: visitor.ahead } : {}),
    ...(visitor.behind !== null ? { behind: visitor.behind } : {}),
    ...(visitor.lotteryOdds !== null ? { lotteryOdds: visitor.lotteryOdds } : {}),
  };
}

export async function handleJoin(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const secret = requireTokenSecret(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE);
  const visitorId = parseOptionalVisitorId(body.visitorId);

  const room = getQueueRoom(env, queue);
  const joined = await room.join({
    queue,
    config,
    ...(visitorId ? { visitorId } : {}),
  });

  let accessToken: string | undefined;
  if (joined.status === "admitted") {
    accessToken = await signAccessToken(
      buildAdmissionClaims({
        visitorId: joined.id,
        queue,
        tokenTTLSeconds: config.tokenTTLSeconds,
      }),
      secret,
    );
  }

  const result: JoinResult = {
    ...visitorPayload(joined),
    ...(accessToken ? { accessToken } : {}),
  };

  return jsonOk(result, joined.status === "admitted" ? 200 : 202);
}

export async function handleStatus(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const config = loadConfig(env);
  const secret = requireTokenSecret(env);
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE);
  const visitorId = parseRequiredVisitorId(url.searchParams.get("id"));

  const room = getQueueRoom(env, queue);
  const status = await room.status({ queue, config, visitorId });
  if (!status.ok) {
    throw new ApiError("not_found", "Visitor not found in this queue", 404);
  }

  let accessToken: string | undefined;
  if (status.visitor.status === "admitted") {
    accessToken = await signAccessToken(
      buildAdmissionClaims({
        visitorId: status.visitor.id,
        queue,
        tokenTTLSeconds: config.tokenTTLSeconds,
        ...(status.visitor.admittedAt ? { nowMs: status.visitor.admittedAt } : {}),
      }),
      secret,
    );
  }

  const result: StatusResult = {
    ...visitorPayload(status.visitor),
    ...(accessToken ? { accessToken } : {}),
  };

  return jsonOk(result);
}

export async function handleLeave(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE);
  const visitorId = parseRequiredVisitorId(body.visitorId ?? body.id);

  const room = getQueueRoom(env, queue);
  const left = await room.leave({ queue, config, visitorId });
  return jsonOk(left);
}

export async function handleHeartbeat(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE);
  const visitorId = parseRequiredVisitorId(body.visitorId ?? body.id);

  const room = getQueueRoom(env, queue);
  const beat = await room.heartbeat({ queue, config, visitorId });
  if (!beat.ok) {
    throw new ApiError("not_found", "Waiting visitor not found", 404);
  }

  return jsonOk({
    visitorId: beat.visitor.id,
    status: beat.visitor.status,
    position: beat.visitor.position,
    estimatedWaitSeconds: beat.visitor.estimatedWaitSeconds,
    admissionMode: beat.visitor.admissionMode,
    waiting: beat.visitor.waiting,
    ...(beat.visitor.ahead !== null ? { ahead: beat.visitor.ahead } : {}),
    ...(beat.visitor.behind !== null ? { behind: beat.visitor.behind } : {}),
    ...(beat.visitor.lotteryOdds !== null ? { lotteryOdds: beat.visitor.lotteryOdds } : {}),
    lastHeartbeatAt: beat.visitor.lastHeartbeatAt,
  });
}

export async function handleAdmit(request: Request, env: Env): Promise<Response> {
  await requireOperator(request, env);

  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE);
  const count = parseOptionalCount(body.count, 1);

  const room = getQueueRoom(env, queue);
  const admitted = await room.forceAdmit({ queue, config, count });
  return jsonOk(admitted);
}

export async function handleMode(request: Request, env: Env): Promise<Response> {
  await requireOperator(request, env);

  const body = await readJsonBody(request);
  const config = loadConfig(env);
  const queue = parseQueueName(body.queue, env.DEFAULT_QUEUE);
  const mode = parseAdmissionMode(body.mode);
  if (!mode) {
    throw new ApiError("bad_request", 'mode must be "queue" or "lottery"', 400);
  }

  const room = getQueueRoom(env, queue);
  const result = await room.setMode({ queue, config, mode });
  return jsonOk(result);
}

export async function handleMetrics(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const config = loadConfig(env);
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE);

  const room = getQueueRoom(env, queue);
  const metrics = await room.metrics({ queue, config });
  return jsonOk(metrics);
}

/**
 * Validate an admission token from Authorization / query / cookie.
 * Used by protected demo routes.
 */
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
    const claims = await verifyAccessToken(token, requireTokenSecret(env), {
      ...(expectedQueue ? { expectedQueue } : {}),
    });
    return { visitorId: claims.sub, queue: claims.queue, token };
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
