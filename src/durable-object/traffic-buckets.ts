/**
 * Open-bucket traffic accounting for QueueRoom (joins/admits per TRAFFIC_BUCKET_MS).
 */

import type { QueueConfig } from "../core/types";
import { TRAFFIC_RETENTION_MS, alignTrafficBucket } from "../queue/traffic";
import type { MetaAccess } from "./schema";

export type TrafficBucketDeps = MetaAccess & {
  sql: SqlStorage;
  /** Resolved admit rate for the bucket being flushed (effectiveConfig.admitPerSecond). */
  resolveAdmitPerSecond: (config: QueueConfig) => number;
  countWaiting: () => number;
  countEntered: () => number;
};

export function totalInflow(getMeta: MetaAccess["getMeta"]): number {
  const raw = Number(getMeta("total_inflow") ?? "0");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export function currentTrafficOpen(
  now: number,
  getMeta: MetaAccess["getMeta"],
): { joins: number; admits: number } {
  const bucket = alignTrafficBucket(now);
  const openT = Number(getMeta("traffic_open_t") ?? "0");
  if (openT !== bucket) {
    return { joins: 0, admits: 0 };
  }
  return {
    joins: Number(getMeta("traffic_open_joins") ?? "0") || 0,
    admits: Number(getMeta("traffic_open_admits") ?? "0") || 0,
  };
}

export function recordTraffic(
  deps: TrafficBucketDeps,
  now: number,
  config: QueueConfig,
  delta: { joins: number; admits: number },
): void {
  flushTrafficBucket(deps, now, config);
  const { getMeta, setMeta } = deps;
  const bucket = alignTrafficBucket(now);
  const openT = Number(getMeta("traffic_open_t") ?? "0");
  let joins = Number(getMeta("traffic_open_joins") ?? "0") || 0;
  let admits = Number(getMeta("traffic_open_admits") ?? "0") || 0;
  if (openT !== bucket) {
    joins = 0;
    admits = 0;
    setMeta("traffic_open_t", String(bucket));
  }
  joins += delta.joins;
  admits += delta.admits;
  setMeta("traffic_open_joins", String(joins));
  setMeta("traffic_open_admits", String(admits));
  if (delta.joins > 0) {
    setMeta("total_inflow", String(totalInflow(getMeta) + delta.joins));
  }
}

export function flushTrafficBucket(
  deps: TrafficBucketDeps,
  now: number,
  config: QueueConfig,
): void {
  const { sql, getMeta, setMeta, resolveAdmitPerSecond, countWaiting, countEntered } = deps;
  const openT = Number(getMeta("traffic_open_t") ?? "0");
  if (!Number.isFinite(openT) || openT <= 0) {
    setMeta("traffic_open_t", String(alignTrafficBucket(now)));
    setMeta("traffic_open_joins", "0");
    setMeta("traffic_open_admits", "0");
    return;
  }

  const current = alignTrafficBucket(now);
  if (openT >= current) {
    return;
  }

  const joins = Number(getMeta("traffic_open_joins") ?? "0") || 0;
  const admits = Number(getMeta("traffic_open_admits") ?? "0") || 0;
  const maxOutflow = resolveAdmitPerSecond(config);
  const waiting = countWaiting();
  const entered = countEntered();

  sql.exec(
    `INSERT INTO traffic_buckets (t, joins, admits, max_outflow, waiting, entered)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(t) DO UPDATE SET
         joins = joins + excluded.joins,
         admits = admits + excluded.admits,
         max_outflow = excluded.max_outflow,
         waiting = excluded.waiting,
         entered = excluded.entered`,
    openT,
    joins,
    admits,
    maxOutflow,
    waiting,
    entered,
  );

  const cutoff = now - TRAFFIC_RETENTION_MS;
  sql.exec(`DELETE FROM traffic_buckets WHERE t < ?`, cutoff);

  setMeta("traffic_open_t", String(current));
  setMeta("traffic_open_joins", "0");
  setMeta("traffic_open_admits", "0");
}
