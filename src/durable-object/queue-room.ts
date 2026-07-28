import { DurableObject } from "cloudflare:workers";
import { defaultEtaCalculator } from "../core/eta";
import type { AdmissionMode, QueueConfig } from "../core/types";
import {
  QUEUE_ALARM_INTERVAL_MS,
  admissionsForTick,
  isAdmissionExpired,
  isHeartbeatExpired,
  isQueueStayExpired,
  openSlots,
  waitingPosition,
} from "../queue/engine";
import { buildMetrics } from "../queue/types";
import type {
  QueueForceAdmitRequest,
  QueueForceAdmitResponse,
  QueueHeartbeatResponse,
  QueueJoinRequest,
  QueueJoinResponse,
  QueueLeaveResponse,
  QueueMetricsRequest,
  QueueMetricsResponse,
  QueueSetModeRequest,
  QueueSetModeResponse,
  QueueStatusResponse,
  QueueVisitorRequest,
} from "../queue/types";

type SqlValue = string | number | null;

interface VisitorRow {
  [key: string]: SqlValue;
  id: string;
  status: string;
  joined_at: number;
  last_heartbeat_at: number;
  admitted_at: number | null;
  sequence: number;
}

/**
 * Authoritative state for a single named waiting room.
 *
 * Durable Objects are used instead of KV because queue ordering requires
 * strong consistency and serialized writes. KV is eventually consistent and
 * cannot safely coordinate concurrent join/admit operations.
 *
 * Cost notes:
 * - All queue mutations stay inside this object (no per-request KV writes).
 * - A single alarm sweeps admission + expiry; it is cleared when the room is idle.
 * - Branding / admin config belongs in KV and is read on page render, not on every poll.
 */
export class QueueRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.ctx.blockConcurrencyWhile(async () => {
      this.migrate();
    });
  }

  async ping(): Promise<{ ok: true; queue: string }> {
    return { ok: true, queue: this.queueName() };
  }

  async join(request: QueueJoinRequest): Promise<QueueJoinResponse> {
    const now = request.now ?? Date.now();
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.sweep(request.config, now);

    const visitorId = request.visitorId ?? crypto.randomUUID();
    const existing = this.getVisitor(visitorId);

    if (existing && (existing.status === "waiting" || existing.status === "admitted")) {
      await this.ensureAlarm();
      return this.toView(existing, request.config);
    }

    const paused = this.isPaused();
    const admitted = this.countByStatus("admitted");
    const slots = openSlots(request.config.maxConcurrentUsers, admitted);

    if (!paused && slots > 0) {
      this.insertVisitor({
        id: visitorId,
        status: "admitted",
        joinedAt: now,
        lastHeartbeatAt: now,
        admittedAt: now,
      });
      await this.ensureAlarm();
      return this.toView(this.getVisitor(visitorId)!, request.config);
    }

    this.insertVisitor({
      id: visitorId,
      status: "waiting",
      joinedAt: now,
      lastHeartbeatAt: now,
      admittedAt: null,
    });
    await this.ensureAlarm();
    return this.toView(this.getVisitor(visitorId)!, request.config);
  }

  async status(request: QueueVisitorRequest): Promise<QueueStatusResponse> {
    const now = request.now ?? Date.now();
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.sweep(request.config, now);

    const visitor = this.getVisitor(request.visitorId);
    if (!visitor || visitor.status === "left" || visitor.status === "expired") {
      return { ok: false, code: "not_found" };
    }

    return { ok: true, visitor: this.toView(visitor, request.config) };
  }

  async leave(request: QueueVisitorRequest): Promise<QueueLeaveResponse> {
    const now = request.now ?? Date.now();
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.sweep(request.config, now);

    const visitor = this.getVisitor(request.visitorId);
    if (!visitor) {
      return { visitorId: request.visitorId, status: "not_found" };
    }
    if (visitor.status === "expired") {
      return { visitorId: request.visitorId, status: "expired" };
    }
    if (visitor.status === "left") {
      return { visitorId: request.visitorId, status: "left" };
    }

    this.ctx.storage.sql.exec(
      `UPDATE visitors SET status = 'left' WHERE id = ? AND status IN ('waiting', 'admitted')`,
      request.visitorId,
    );

    this.admitAvailable(request.config, now);
    await this.ensureAlarm();
    return { visitorId: request.visitorId, status: "left" };
  }

  async heartbeat(request: QueueVisitorRequest): Promise<QueueHeartbeatResponse> {
    const now = request.now ?? Date.now();
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.sweep(request.config, now);

    const visitor = this.getVisitor(request.visitorId);
    if (!visitor || visitor.status !== "waiting") {
      return { ok: false, code: "not_found" };
    }

    this.ctx.storage.sql.exec(
      `UPDATE visitors SET last_heartbeat_at = ? WHERE id = ? AND status = 'waiting'`,
      now,
      request.visitorId,
    );

    return { ok: true, visitor: this.toView(this.getVisitor(request.visitorId)!, request.config) };
  }

  async metrics(request: QueueMetricsRequest): Promise<QueueMetricsResponse> {
    const now = request.now ?? Date.now();
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.sweep(request.config, now);

    return buildMetrics({
      queue: this.queueName(),
      config: request.config,
      waiting: this.countByStatus("waiting"),
      admitted: this.countByStatus("admitted"),
      paused: this.isPaused(),
      admissionMode: this.admissionMode(request.config),
    });
  }

  /**
   * Operator-assisted admission: fill open slots up to `count`.
   * Uses Queue Mode (FIFO) or Lottery Mode (random) based on room settings.
   * Still respects pause and capacity; ignores the per-second rate budget.
   */
  async forceAdmit(request: QueueForceAdmitRequest): Promise<QueueForceAdmitResponse> {
    const now = request.now ?? Date.now();
    const count = request.count ?? 1;
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.sweep(request.config, now);

    const admittedIds: string[] = [];
    if (!this.isPaused()) {
      const slots = openSlots(request.config.maxConcurrentUsers, this.countByStatus("admitted"));
      const toAdmit = Math.min(slots, count);
      if (toAdmit > 0) {
        for (const row of this.selectWaiting(toAdmit, request.config)) {
          this.ctx.storage.sql.exec(
            `UPDATE visitors
             SET status = 'admitted', admitted_at = ?, last_heartbeat_at = ?
             WHERE id = ? AND status = 'waiting'`,
            now,
            now,
            row.id,
          );
          admittedIds.push(row.id);
        }
      }
    }

    await this.ensureAlarm();
    return {
      admitted: admittedIds,
      waiting: this.countByStatus("waiting"),
      openSlots: openSlots(request.config.maxConcurrentUsers, this.countByStatus("admitted")),
    };
  }

  async setMode(request: QueueSetModeRequest): Promise<QueueSetModeResponse> {
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.setMeta("admission_mode", request.mode);
    // Keep alarm config in sync so ticks use the new mode.
    this.setMeta(
      "config",
      JSON.stringify({ ...request.config, admissionMode: request.mode } satisfies QueueConfig),
    );
    await this.ensureAlarm();
    return { admissionMode: request.mode };
  }

  async setPaused(paused: boolean): Promise<{ paused: boolean }> {
    this.setMeta("paused", paused ? "1" : "0");
    if (!paused) {
      await this.ensureAlarm();
    }
    return { paused };
  }

  async alarm(): Promise<void> {
    const config = this.alarmConfig();
    if (!config) {
      return;
    }

    const now = Date.now();
    this.sweep(config, now);
    this.admitFromBudget(config, now);
    await this.ensureAlarm();
  }

  /**
   * Persist the config used by alarms.
   * Avoids reading Worker env inside the DO alarm path.
   */
  async configure(config: QueueConfig): Promise<void> {
    this.setMeta("config", JSON.stringify(config));
    await this.ensureAlarm();
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    const version = Number(this.getMeta("schema_version") ?? "0");
    if (version < 1) {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS visitors (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          joined_at INTEGER NOT NULL,
          last_heartbeat_at INTEGER NOT NULL,
          admitted_at INTEGER,
          sequence INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_visitors_status_sequence
          ON visitors (status, sequence)
      `);
      this.setMeta("schema_version", "1");
    }
  }

  private sweep(config: QueueConfig, now: number): void {
    const active = this.ctx.storage.sql
      .exec<VisitorRow>(
        `SELECT id, status, joined_at, last_heartbeat_at, admitted_at, sequence
         FROM visitors
         WHERE status IN ('waiting', 'admitted')`,
      )
      .toArray();

    for (const visitor of active) {
      if (visitor.status === "waiting") {
        if (
          isHeartbeatExpired(visitor.last_heartbeat_at, now, config) ||
          isQueueStayExpired(visitor.joined_at, now, config)
        ) {
          this.ctx.storage.sql.exec(
            `UPDATE visitors SET status = 'expired' WHERE id = ? AND status = 'waiting'`,
            visitor.id,
          );
        }
      } else if (
        visitor.admitted_at !== null &&
        isAdmissionExpired(visitor.admitted_at, now, config)
      ) {
        this.ctx.storage.sql.exec(
          `UPDATE visitors SET status = 'expired' WHERE id = ? AND status = 'admitted'`,
          visitor.id,
        );
      }
    }
  }

  private admitAvailable(config: QueueConfig, now: number): void {
    if (this.isPaused()) {
      return;
    }

    const slots = openSlots(config.maxConcurrentUsers, this.countByStatus("admitted"));
    if (slots <= 0) {
      return;
    }

    for (const row of this.selectWaiting(slots, config)) {
      this.ctx.storage.sql.exec(
        `UPDATE visitors
         SET status = 'admitted', admitted_at = ?, last_heartbeat_at = ?
         WHERE id = ? AND status = 'waiting'`,
        now,
        now,
        row.id,
      );
    }
  }

  private admitFromBudget(config: QueueConfig, now: number): void {
    if (this.isPaused()) {
      return;
    }

    const remainder = Number(this.getMeta("admit_remainder") ?? "0");
    const { admitCount, nextRemainder } = admissionsForTick(
      config.admitPerSecond,
      QUEUE_ALARM_INTERVAL_MS,
      Number.isFinite(remainder) ? remainder : 0,
    );
    this.setMeta("admit_remainder", String(nextRemainder));

    if (admitCount <= 0) {
      return;
    }

    const slots = openSlots(config.maxConcurrentUsers, this.countByStatus("admitted"));
    const toAdmit = Math.min(slots, admitCount);
    if (toAdmit <= 0) {
      return;
    }

    for (const row of this.selectWaiting(toAdmit, config)) {
      this.ctx.storage.sql.exec(
        `UPDATE visitors
         SET status = 'admitted', admitted_at = ?, last_heartbeat_at = ?
         WHERE id = ? AND status = 'waiting'`,
        now,
        now,
        row.id,
      );
    }
  }

  /**
   * Pick waiting visitors for admission.
   * Queue Mode: oldest sequence first. Lottery Mode: uniform random sample.
   */
  private selectWaiting(limit: number, config: QueueConfig): Array<{ id: string }> {
    if (limit <= 0) {
      return [];
    }

    const mode = this.admissionMode(config);
    if (mode === "lottery") {
      return this.ctx.storage.sql
        .exec<{ id: string }>(
          `SELECT id FROM visitors
           WHERE status = 'waiting'
           ORDER BY RANDOM()
           LIMIT ?`,
          limit,
        )
        .toArray();
    }

    return this.ctx.storage.sql
      .exec<{ id: string }>(
        `SELECT id FROM visitors
         WHERE status = 'waiting'
         ORDER BY sequence ASC
         LIMIT ?`,
        limit,
      )
      .toArray();
  }

  private admissionMode(config: QueueConfig): AdmissionMode {
    const override = this.getMeta("admission_mode");
    if (override === "queue" || override === "lottery") {
      return override;
    }
    return config.admissionMode;
  }

  private insertVisitor(input: {
    id: string;
    status: "waiting" | "admitted";
    joinedAt: number;
    lastHeartbeatAt: number;
    admittedAt: number | null;
  }): void {
    const sequence = this.nextSequence();
    this.ctx.storage.sql.exec(
      `INSERT INTO visitors (id, status, joined_at, last_heartbeat_at, admitted_at, sequence)
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.id,
      input.status,
      input.joinedAt,
      input.lastHeartbeatAt,
      input.admittedAt,
      sequence,
    );
  }

  private nextSequence(): number {
    const current = Number(this.getMeta("next_sequence") ?? "1");
    const next = Number.isFinite(current) ? current : 1;
    this.setMeta("next_sequence", String(next + 1));
    return next;
  }

  private getVisitor(id: string): VisitorRow | null {
    const row = this.ctx.storage.sql
      .exec<VisitorRow>(
        `SELECT id, status, joined_at, last_heartbeat_at, admitted_at, sequence
         FROM visitors WHERE id = ?`,
        id,
      )
      .toArray()[0];
    return row ?? null;
  }

  private countByStatus(status: "waiting" | "admitted"): number {
    return this.ctx.storage.sql
      .exec<{ count: number }>(`SELECT COUNT(*) AS count FROM visitors WHERE status = ?`, status)
      .one().count;
  }

  private waitingAhead(sequence: number): number {
    return this.ctx.storage.sql
      .exec<{ count: number }>(
        `SELECT COUNT(*) AS count FROM visitors
         WHERE status = 'waiting' AND sequence < ?`,
        sequence,
      )
      .one().count;
  }

  private toView(visitor: VisitorRow, config: QueueConfig) {
    const status = visitor.status as "waiting" | "admitted" | "expired" | "left";
    const mode = this.admissionMode(config);
    const waiting = this.countByStatus("waiting");
    let position: number | null = null;
    let estimatedWaitSeconds = 0;
    let lotteryOdds: number | null = null;
    let ahead: number | null = null;
    let behind: number | null = null;

    if (status === "waiting") {
      if (mode === "lottery") {
        // No FIFO place in line — show equal odds among current waiters.
        lotteryOdds = waiting > 0 ? 1 / waiting : null;
        estimatedWaitSeconds = defaultEtaCalculator.estimateWaitSeconds(waiting, config);
      } else {
        position = waitingPosition(this.waitingAhead(visitor.sequence));
        ahead = position - 1;
        behind = Math.max(0, waiting - position);
        estimatedWaitSeconds = defaultEtaCalculator.estimateWaitSeconds(position, config);
      }
    }

    return {
      id: visitor.id,
      status,
      joinedAt: visitor.joined_at,
      lastHeartbeatAt: visitor.last_heartbeat_at,
      admittedAt: visitor.admitted_at,
      position,
      estimatedWaitSeconds,
      admissionMode: mode,
      waiting,
      ahead,
      behind,
      lotteryOdds,
    };
  }

  private rememberConfig(config: QueueConfig): void {
    this.setMeta("config", JSON.stringify(config));
  }

  private ensureQueueName(queue: string): void {
    const existing = this.getMeta("queue_name");
    if (!existing) {
      this.setMeta("queue_name", queue);
    }
  }

  private queueName(): string {
    return this.getMeta("queue_name") ?? this.ctx.id.toString();
  }

  private isPaused(): boolean {
    return this.getMeta("paused") === "1";
  }

  private alarmConfig(): QueueConfig | null {
    const raw = this.getMeta("config");
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as QueueConfig;
    } catch {
      return null;
    }
  }

  private getMeta(key: string): string | null {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key)
      .toArray()[0];
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      value,
    );
  }

  /**
   * Schedule the next sweep only while the room has active work.
   * Idle rooms clear their alarm to avoid waking (and billing) for no reason.
   */
  private async ensureAlarm(): Promise<void> {
    const active = this.ctx.storage.sql
      .exec<{ count: number }>(
        `SELECT COUNT(*) AS count FROM visitors WHERE status IN ('waiting', 'admitted')`,
      )
      .one().count;

    if (active === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const existing = await this.ctx.storage.getAlarm();
    if (existing === null) {
      await this.ctx.storage.setAlarm(Date.now() + QUEUE_ALARM_INTERVAL_MS);
    }
  }
}
