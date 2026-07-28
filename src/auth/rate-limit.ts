import { ApiError } from "../core/errors";

/**
 * Lightweight per-isolate rate limiting for sensitive admin endpoints.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimitOrThrow(key: string, options: { limit: number; windowMs: number }): void {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > options.limit) {
    throw new ApiError("bad_request", "Too many attempts. Try again shortly.", 429);
  }
}
