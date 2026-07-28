import { ApiError } from "../core/errors";
export { requireTokenSecret } from "../auth/operator";
export { extractAccessToken } from "../auth/cookies";

const QUEUE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const VISITOR_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

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
