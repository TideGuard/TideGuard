/**
 * Visitor row SQL helpers for QueueRoom (select / counts / wait stats).
 * Depth cache and admission mutations stay on the Durable Object class.
 */

export type SqlValue = string | number | null;

export interface VisitorRow {
  [key: string]: SqlValue;
  id: string;
  status: string;
  joined_at: number;
  last_heartbeat_at: number;
  admitted_at: number | null;
  sequence: number;
  entered: 0 | 1;
}

export function selectVisitor(sql: SqlStorage, id: string): VisitorRow | null {
  const row = sql
    .exec<VisitorRow>(
      `SELECT id, status, joined_at, last_heartbeat_at, admitted_at, sequence, entered
       FROM visitors WHERE id = ?`,
      id,
    )
    .toArray()[0];
  return row ?? null;
}

export function countEnteredVisitors(sql: SqlStorage): number {
  return sql
    .exec<{ count: number }>(
      `SELECT COUNT(*) AS count FROM visitors WHERE status = 'admitted' AND entered = 1`,
    )
    .one().count;
}

export function waitingWaitStats(
  sql: SqlStorage,
  now: number,
): {
  averageWaitSeconds: number;
  oldestWaitSeconds: number;
} {
  const row = sql
    .exec<{ avg_ms: number | null; max_ms: number | null }>(
      `SELECT AVG(? - joined_at) AS avg_ms, MAX(? - joined_at) AS max_ms
       FROM visitors WHERE status = 'waiting'`,
      now,
      now,
    )
    .toArray()[0];
  const avgMs = row?.avg_ms;
  const maxMs = row?.max_ms;
  return {
    averageWaitSeconds:
      avgMs !== null && avgMs !== undefined && Number.isFinite(avgMs)
        ? Math.max(0, Math.round(avgMs / 1000))
        : 0,
    oldestWaitSeconds:
      maxMs !== null && maxMs !== undefined && Number.isFinite(maxMs)
        ? Math.max(0, Math.round(maxMs / 1000))
        : 0,
  };
}

export function countWaitingAhead(sql: SqlStorage, sequence: number): number {
  return sql
    .exec<{ count: number }>(
      `SELECT COUNT(*) AS count FROM visitors
       WHERE status = 'waiting' AND sequence < ?`,
      sequence,
    )
    .one().count;
}

export function countVisitorsByStatus(sql: SqlStorage, status: "waiting" | "admitted"): number {
  return sql
    .exec<{ count: number }>(`SELECT COUNT(*) AS count FROM visitors WHERE status = ?`, status)
    .one().count;
}
