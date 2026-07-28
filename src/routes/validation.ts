import { ApiError } from "../core/errors";

const QUEUE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const VISITOR_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

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

export function parseQueueName(value: unknown, fallback?: string): string {
  const raw = typeof value === "string" && value.length > 0 ? value : fallback;
  if (!raw || !QUEUE_NAME_RE.test(raw)) {
    throw new ApiError("bad_request", "queue must be 1-64 chars: letters, numbers, _ or -", 400);
  }
  return raw;
}

export function parseOptionalVisitorId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !VISITOR_ID_RE.test(value)) {
    throw new ApiError(
      "bad_request",
      "visitorId must be 1-128 chars: letters, numbers, _ or -",
      400,
    );
  }
  return value;
}

export function parseRequiredVisitorId(value: unknown): string {
  const id = parseOptionalVisitorId(value);
  if (!id) {
    throw new ApiError("bad_request", "visitorId is required", 400);
  }
  return id;
}

export function parseOptionalCount(value: unknown, fallback = 1): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new ApiError("bad_request", "count must be an integer between 1 and 100", 400);
  }
  return count;
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError("bad_request", "Content-Type must be application/json", 400);
  }

  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError("bad_request", "JSON body must be an object", 400);
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError("bad_request", "Invalid JSON body", 400);
  }
}

/**
 * Extract a bearer token from Authorization, query string, or cookie.
 */
export function extractAccessToken(request: Request, url: URL): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
  }

  const queryToken = url.searchParams.get("accessToken");
  if (queryToken) {
    return queryToken;
  }

  const cookie = request.headers.get("cookie");
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)tg_access=([^;]+)/);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}
