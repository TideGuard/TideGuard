/**
 * Traffic time-series helpers for the admin control room.
 * Buckets are produced by QueueRoom and served via GET /api/admin/traffic.
 */

export const TRAFFIC_BUCKET_MS = 15_000;
export const TRAFFIC_RETENTION_MS = 2 * 60 * 60 * 1000;
export const MAX_ADMIT_PER_SECOND = 1_000;
export const MIN_ADMIT_PER_SECOND = 0.01;

export interface TrafficBucket {
  /** Bucket start time (unix ms, aligned to TRAFFIC_BUCKET_MS). */
  t: number;
  joins: number;
  admits: number;
  /** Operator setpoint (admit/s) during this bucket. */
  maxOutflow: number;
  waiting: number;
  entered: number;
}

export function alignTrafficBucket(now: number, bucketMs = TRAFFIC_BUCKET_MS): number {
  return Math.floor(now / bucketMs) * bucketMs;
}

export function parseAdmitPerSecond(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < MIN_ADMIT_PER_SECOND || n > MAX_ADMIT_PER_SECOND) {
    return null;
  }
  return n;
}

export function pruneTrafficBuckets(
  buckets: TrafficBucket[],
  now: number,
  retentionMs = TRAFFIC_RETENTION_MS,
): TrafficBucket[] {
  const cutoff = now - retentionMs;
  return buckets.filter((b) => b.t >= cutoff);
}
