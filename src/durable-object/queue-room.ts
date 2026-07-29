import { DurableObject } from "cloudflare:workers";
import { defaultEtaCalculator } from "../core/eta";
import type { AdmissionMode, QueueConfig } from "../core/types";
import {
  advanceHealthState,
  DEFAULT_HEALTH_CONFIG,
  DEFAULT_HEALTH_STATE,
  healthRateMultiplier,
  isAutoPaused,
  parseHealthConfig,
  probeOriginHealth,
  type OriginHealthConfig,
  type OriginHealthState,
} from "../health/origin-probe";
import {
  QUEUE_ALARM_INTERVAL_MS,
  admissionsForTick,
  openSlots,
  waitingPosition,
} from "../queue/engine";
import { buildMetrics } from "../queue/types";
import type {
  QueueEnterResponse,
  QueueForceAdmitRequest,
  QueueForceAdmitResponse,
  QueueHealthConfigResponse,
  QueueHeartbeatResponse,
  QueueJoinRequest,
  QueueJoinResponse,
  QueueLeaveResponse,
  QueueMetricsRequest,
  QueueMetricsResponse,
  QueueScheduleResponse,
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
  entered: 0 | 1;
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
 * - Waiting/admitted depth is cached in meta (+ memory) so status polls avoid COUNT(*).
 * - FIFO "ahead" counts are memoized between waiting-set mutations (poll-storm friendly).
 * - Lottery picks use indexed OFFSET samples instead of sorting the full waiting set.
 */
export class QueueRoom extends DurableObject<Env> {
  /** Hot-path depth; mirrored to meta (`count_waiting` / `count_admitted`). */
  private depth: { waiting: number; admitted: number } | null = null;
  /** sequence → waitingAhead; cleared when anyone leaves the waiting set. */
  private aheadCache = new Map<number, number>();

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
    this.sweep(request.config, now, true);

    const visitorId = request.visitorId ?? crypto.randomUUID();
    const existing = this.getVisitor(visitorId);

    if (existing && (existing.status === "waiting" || existing.status === "admitted")) {
      await this.ensureAlarm();
      return this.toView(existing, request.config, now);
    }

    const admitted = this.countByStatus("admitted");
    const slots = openSlots(request.config.maxConcurrentUsers, admitted);

    if (this.canAdmit(now) && slots > 0) {
      this.insertVisitor({
        id: visitorId,
        status: "admitted",
        joinedAt: now,
        lastHeartbeatAt: now,
        admittedAt: now,
        entered: !this.effectiveConfig(request.config).requireClickToEnter,
      });
      await this.ensureAlarm();
      return this.toView(this.getVisitor(visitorId)!, request.config, now);
    }

    this.insertVisitor({
      id: visitorId,
      status: "waiting",
      joinedAt: now,
      lastHeartbeatAt: now,
      admittedAt: null,
      entered: false,
    });
    await this.ensureAlarm();
    return this.toView(this.getVisitor(visitorId)!, request.config, now);
  }

  async status(request: QueueVisitorRequest): Promise<QueueStatusResponse> {
    const now = request.now ?? Date.now();
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.sweep(request.config, now, false);

    const visitor = this.getVisitor(request.visitorId);
    if (!visitor || visitor.status === "left" || visitor.status === "expired") {
      return { ok: false, code: "not_found" };
    }

    return { ok: true, visitor: this.toView(visitor, request.config, now) };
  }

  async enter(request: QueueVisitorRequest): Promise<QueueEnterResponse> {
    const now = request.now ?? Date.now();
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.sweep(request.config, now, true);

    const visitor = this.getVisitor(request.visitorId);
    if (!visitor || visitor.status === "left" || visitor.status === "expired") {
      return { ok: false, code: "not_found" };
    }
    if (visitor.status !== "admitted") {
      return { ok: false, code: "not_admitted" };
    }

    this.ctx.storage.sql.exec(
      `UPDATE visitors SET entered = 1 WHERE id = ? AND status = 'admitted'`,
      request.visitorId,
    );

    await this.ensureAlarm();
    return {
      ok: true,
      visitor: this.toView(this.getVisitor(request.visitorId)!, request.config, now),
    };
  }

  async leave(request: QueueVisitorRequest): Promise<QueueLeaveResponse> {
    const now = request.now ?? Date.now();
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.sweep(request.config, now, true);

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

    if (visitor.status === "waiting") {
      this.bumpDepth(-1, 0);
      this.aheadCache.clear();
    } else if (visitor.status === "admitted") {
      this.bumpDepth(0, -1);
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
    this.sweep(request.config, now, false);

    const visitor = this.getVisitor(request.visitorId);
    if (!visitor || visitor.status !== "waiting") {
      return { ok: false, code: "not_found" };
    }

    this.ctx.storage.sql.exec(
      `UPDATE visitors SET last_heartbeat_at = ? WHERE id = ? AND status = 'waiting'`,
      now,
      request.visitorId,
    );

    return {
      ok: true,
      visitor: this.toView(this.getVisitor(request.visitorId)!, request.config, now),
    };
  }

  async metrics(request: QueueMetricsRequest): Promise<QueueMetricsResponse> {
    const now = request.now ?? Date.now();
    this.ensureQueueName(request.queue);
    this.rememberConfig(request.config);
    this.sweep(request.config, now, false);

    const waiting = this.countByStatus("waiting");
    const admitted = this.countByStatus("admitted");
    const entered = this.countEntered();
    const waitStats = this.waitingWaitStats(now);
    const holding = Math.max(0, admitted - entered);

    return buildMetrics({
      queue: this.queueName(),
      config: request.config,
      waiting,
      admitted,
      entered,
      holding,
      openSlots: openSlots(request.config.maxConcurrentUsers, admitted),
      averageWaitSeconds: waitStats.averageWaitSeconds,
      oldestWaitSeconds: waitStats.oldestWaitSeconds,
      paused: this.isManualPaused(),
      admissionMode: this.admissionMode(request.config),
      opensAt: this.getOpensAt(),
      effectiveAdmitPerSecond: this.effectiveAdmitPerSecond(request.config, now),
      health: this.healthSnapshot(now),
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
    this.sweep(request.config, now, true);

    let admittedIds: string[] = [];
    if (this.canAdmit(now)) {
      const slots = openSlots(request.config.maxConcurrentUsers, this.countByStatus("admitted"));
      const toAdmit = Math.min(slots, count);
      if (toAdmit > 0) {
        admittedIds = this.admitSelected(
          this.selectWaiting(toAdmit, request.config),
          request.config,
          now,
        );
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
      JSON.stringify({
        ...this.effectiveConfig(request.config),
        admissionMode: request.mode,
      } satisfies QueueConfig),
    );
    await this.ensureAlarm();
    return { admissionMode: request.mode };
  }

  /** Persist click-to-enter / hold / depth settings from admin branding (KV → DO). */
  async setAdmitUx(request: {
    queue: string;
    config: QueueConfig;
    requireClickToEnter: boolean;
    admitHoldSeconds: number;
    showWaitingCount?: boolean;
  }): Promise<{
    requireClickToEnter: boolean;
    admitHoldSeconds: number;
    showWaitingCount: boolean;
  }> {
    this.ensureQueueName(request.queue);
    this.setMeta("require_click", request.requireClickToEnter ? "1" : "0");
    this.setMeta("admit_hold_seconds", String(request.admitHoldSeconds));
    if (request.showWaitingCount !== undefined) {
      this.setMeta("show_waiting_count", request.showWaitingCount ? "1" : "0");
    }
    this.rememberConfig({
      ...request.config,
      requireClickToEnter: request.requireClickToEnter,
      admitHoldSeconds: request.admitHoldSeconds,
    });
    await this.ensureAlarm();
    return {
      requireClickToEnter: request.requireClickToEnter,
      admitHoldSeconds: request.admitHoldSeconds,
      showWaitingCount: this.showWaitingCount(),
    };
  }

  async setPaused(paused: boolean): Promise<{ paused: boolean }> {
    this.setMeta("paused", paused ? "1" : "0");
    if (!paused) {
      await this.ensureAlarm();
    }
    return { paused };
  }

  async setOpensAt(opensAt: number | null): Promise<QueueScheduleResponse> {
    if (opensAt === null) {
      this.setMeta("opens_at", "");
    } else {
      this.setMeta("opens_at", String(opensAt));
    }
    await this.ensureAlarm();
    return { opensAt: this.getOpensAt() };
  }

  async getSchedule(): Promise<QueueScheduleResponse> {
    return { opensAt: this.getOpensAt() };
  }

  async getHealth(): Promise<QueueHealthConfigResponse> {
    return { config: this.readHealthConfig(), state: this.readHealthState() };
  }

  async setHealthConfig(input: {
    queue: string;
    config: QueueConfig;
    health: Partial<OriginHealthConfig>;
  }): Promise<QueueHealthConfigResponse> {
    this.ensureQueueName(input.queue);
    this.rememberConfig(input.config);
    const parsed = parseHealthConfig({ ...this.readHealthConfig(), ...input.health });
    this.setMeta("health_config", JSON.stringify(parsed));
    if (!parsed.enabled) {
      this.setMeta("health_state", JSON.stringify(DEFAULT_HEALTH_STATE));
    }
    await this.ensureAlarm();
    return { config: parsed, state: this.readHealthState() };
  }

  async overrideHealth(minutes: number): Promise<QueueHealthConfigResponse> {
    const config = this.readHealthConfig();
    const until = Date.now() + Math.max(1, Math.min(minutes, 24 * 60)) * 60_000;
    const next = { ...config, overrideUntil: until };
    this.setMeta("health_config", JSON.stringify(next));
    await this.ensureAlarm();
    return { config: next, state: this.readHealthState() };
  }

  async clearHealthOverride(): Promise<QueueHealthConfigResponse> {
    const config = { ...this.readHealthConfig(), overrideUntil: null };
    this.setMeta("health_config", JSON.stringify(config));
    return { config, state: this.readHealthState() };
  }

  async alarm(): Promise<void> {
    const config = this.alarmConfig();
    if (!config) {
      return;
    }

    const now = Date.now();
    this.sweep(config, now, true);
    await this.maybeProbeHealth(now);
    this.admitFromBudget(config, now);

    await this.ensureAlarm();
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    let version = Number(this.getMeta("schema_version") ?? "0");
    if (version < 1) {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS visitors (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          joined_at INTEGER NOT NULL,
          last_heartbeat_at INTEGER NOT NULL,
          admitted_at INTEGER,
          sequence INTEGER NOT NULL,
          entered INTEGER NOT NULL DEFAULT 1
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_visitors_status_sequence
          ON visitors (status, sequence)
      `);
      version = 2;
      this.setMeta("schema_version", "2");
    } else if (version < 2) {
      this.ctx.storage.sql.exec(`
        ALTER TABLE visitors ADD COLUMN entered INTEGER NOT NULL DEFAULT 1
      `);
      version = 2;
      this.setMeta("schema_version", "2");
    }

    if (version < 3) {
      this.reconcileDepth();
      this.setMeta("schema_version", "3");
      version = 3;
    }
  }

  private sweep(config: QueueConfig, now: number, force: boolean): void {
    const last = Number(this.getMeta("last_sweep") ?? "0");
    if (!force && Number.isFinite(last) && now - last < 1_000) {
      return;
    }
    this.setMeta("last_sweep", String(now));

    const effective = this.effectiveConfig(config);
    const heartbeatCutoff = now - effective.heartbeatTimeoutSeconds * 1000;
    const stayCutoff = now - effective.queueTimeoutSeconds * 1000;
    const holdCutoff = now - effective.admitHoldSeconds * 1000;
    const tokenCutoff = now - effective.tokenTTLSeconds * 1000;

    let expired = 0;
    expired += this.ctx.storage.sql.exec(
      `UPDATE visitors SET status = 'expired'
       WHERE status = 'waiting'
         AND (last_heartbeat_at <= ? OR joined_at <= ?)`,
      heartbeatCutoff,
      stayCutoff,
    ).rowsWritten;
    expired += this.ctx.storage.sql.exec(
      `UPDATE visitors SET status = 'expired'
       WHERE status = 'admitted'
         AND entered = 0
         AND admitted_at IS NOT NULL
         AND admitted_at <= ?`,
      holdCutoff,
    ).rowsWritten;
    expired += this.ctx.storage.sql.exec(
      `UPDATE visitors SET status = 'expired'
       WHERE status = 'admitted'
         AND (entered = 1 OR entered IS NULL)
         AND admitted_at IS NOT NULL
         AND admitted_at <= ?`,
      tokenCutoff,
    ).rowsWritten;

    // Keep SQLite lean: drop terminal rows older than 1 hour.
    const purgeBefore = now - 60 * 60 * 1000;
    this.ctx.storage.sql.exec(
      `DELETE FROM visitors
       WHERE status IN ('left', 'expired') AND joined_at < ?`,
      purgeBefore,
    );

    if (expired > 0) {
      this.reconcileDepth();
    }
  }

  private admitAvailable(config: QueueConfig, now: number): void {
    if (!this.canAdmit(now)) {
      return;
    }

    const slots = openSlots(config.maxConcurrentUsers, this.countByStatus("admitted"));
    if (slots <= 0) {
      return;
    }

    this.admitSelected(this.selectWaiting(slots, config), config, now);
  }

  private admitFromBudget(config: QueueConfig, now: number): void {
    if (!this.canAdmit(now)) {
      return;
    }

    const rate = this.effectiveAdmitPerSecond(config, now);
    if (rate <= 0) {
      return;
    }

    const remainder = Number(this.getMeta("admit_remainder") ?? "0");
    const { admitCount, nextRemainder } = admissionsForTick(
      rate,
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

    this.admitSelected(this.selectWaiting(toAdmit, config), config, now);
  }

  /**
   * Promote selected waiters to admitted and keep depth caches coherent.
   */
  private admitSelected(rows: Array<{ id: string }>, config: QueueConfig, now: number): string[] {
    if (rows.length === 0) {
      return [];
    }

    const entered = this.admitEntered(config);
    const admittedIds: string[] = [];
    for (const row of rows) {
      const result = this.ctx.storage.sql.exec(
        `UPDATE visitors
         SET status = 'admitted', admitted_at = ?, last_heartbeat_at = ?, entered = ?
         WHERE id = ? AND status = 'waiting'`,
        now,
        now,
        entered,
        row.id,
      );
      if (result.rowsWritten > 0) {
        admittedIds.push(row.id);
      }
    }

    if (admittedIds.length > 0) {
      this.bumpDepth(-admittedIds.length, admittedIds.length);
      this.aheadCache.clear();
    }
    return admittedIds;
  }

  /**
   * Pick waiting visitors for admission.
   * Queue Mode: oldest sequence first. Lottery Mode: uniform index samples via OFFSET.
   */
  private selectWaiting(limit: number, config: QueueConfig): Array<{ id: string }> {
    if (limit <= 0) {
      return [];
    }

    const mode = this.admissionMode(config);
    if (mode === "lottery") {
      return this.selectWaitingLottery(limit);
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

  /**
   * Uniform lottery without `ORDER BY RANDOM()` (full-set sort).
   * Small batches: distinct random OFFSETs on the status/sequence index.
   * Large admin batches: fall back to RANDOM() once — rare path.
   */
  private selectWaitingLottery(limit: number): Array<{ id: string }> {
    const waiting = this.countByStatus("waiting");
    const take = Math.min(limit, waiting);
    if (take <= 0) {
      return [];
    }

    if (take > 32) {
      return this.ctx.storage.sql
        .exec<{ id: string }>(
          `SELECT id FROM visitors
           WHERE status = 'waiting'
           ORDER BY RANDOM()
           LIMIT ?`,
          take,
        )
        .toArray();
    }

    if (take === waiting) {
      return this.ctx.storage.sql
        .exec<{ id: string }>(
          `SELECT id FROM visitors
           WHERE status = 'waiting'
           ORDER BY sequence ASC
           LIMIT ?`,
          take,
        )
        .toArray();
    }

    const offsets = new Set<number>();
    let guard = 0;
    while (offsets.size < take && guard < take * 8) {
      offsets.add(Math.floor(Math.random() * waiting));
      guard += 1;
    }

    const ids: Array<{ id: string }> = [];
    const seen = new Set<string>();
    for (const offset of offsets) {
      const row = this.ctx.storage.sql
        .exec<{ id: string }>(
          `SELECT id FROM visitors
           WHERE status = 'waiting'
           ORDER BY sequence ASC
           LIMIT 1 OFFSET ?`,
          offset,
        )
        .toArray()[0];
      if (row && !seen.has(row.id)) {
        seen.add(row.id);
        ids.push(row);
      }
    }
    return ids;
  }

  private admissionMode(config: QueueConfig): AdmissionMode {
    const override = this.getMeta("admission_mode");
    if (override === "queue" || override === "lottery") {
      return override;
    }
    return config.admissionMode;
  }

  private admitEntered(config: QueueConfig): 0 | 1 {
    return this.effectiveConfig(config).requireClickToEnter ? 0 : 1;
  }

  private effectiveConfig(config: QueueConfig): QueueConfig {
    const click = this.getMeta("require_click");
    const holdRaw = this.getMeta("admit_hold_seconds");
    const hold = holdRaw !== null ? Number(holdRaw) : config.admitHoldSeconds;
    return {
      ...config,
      requireClickToEnter: click === null ? config.requireClickToEnter : click === "1",
      admitHoldSeconds:
        Number.isFinite(hold) && hold >= 15 && hold <= 900 ? hold : config.admitHoldSeconds,
    };
  }

  private insertVisitor(input: {
    id: string;
    status: "waiting" | "admitted";
    joinedAt: number;
    lastHeartbeatAt: number;
    admittedAt: number | null;
    entered: boolean;
  }): void {
    const sequence = this.nextSequence();
    this.ctx.storage.sql.exec(
      `INSERT INTO visitors (id, status, joined_at, last_heartbeat_at, admitted_at, sequence, entered)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.status,
      input.joinedAt,
      input.lastHeartbeatAt,
      input.admittedAt,
      sequence,
      input.entered ? 1 : 0,
    );
    if (input.status === "waiting") {
      this.bumpDepth(1, 0);
      // New waiters always get a higher sequence than existing ones, so ahead
      // counts for current waiters stay valid; only depth changes.
    } else {
      this.bumpDepth(0, 1);
    }
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
        `SELECT id, status, joined_at, last_heartbeat_at, admitted_at, sequence, entered
         FROM visitors WHERE id = ?`,
        id,
      )
      .toArray()[0];
    return row ?? null;
  }

  private countByStatus(status: "waiting" | "admitted"): number {
    this.ensureDepth();
    return status === "waiting" ? this.depth!.waiting : this.depth!.admitted;
  }

  private countEntered(): number {
    return this.ctx.storage.sql
      .exec<{ count: number }>(
        `SELECT COUNT(*) AS count FROM visitors WHERE status = 'admitted' AND entered = 1`,
      )
      .one().count;
  }

  private waitingWaitStats(now: number): {
    averageWaitSeconds: number;
    oldestWaitSeconds: number;
  } {
    const row = this.ctx.storage.sql
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

  private waitingAhead(sequence: number): number {
    const cached = this.aheadCache.get(sequence);
    if (cached !== undefined) {
      return cached;
    }
    const ahead = this.ctx.storage.sql
      .exec<{ count: number }>(
        `SELECT COUNT(*) AS count FROM visitors
         WHERE status = 'waiting' AND sequence < ?`,
        sequence,
      )
      .one().count;
    this.aheadCache.set(sequence, ahead);
    return ahead;
  }

  private ensureDepth(): void {
    if (this.depth) {
      return;
    }
    const waitingRaw = this.getMeta("count_waiting");
    const admittedRaw = this.getMeta("count_admitted");
    const waiting = waitingRaw !== null ? Number(waitingRaw) : NaN;
    const admitted = admittedRaw !== null ? Number(admittedRaw) : NaN;
    if (Number.isFinite(waiting) && Number.isFinite(admitted) && waiting >= 0 && admitted >= 0) {
      this.depth = { waiting, admitted };
      return;
    }
    this.reconcileDepth();
  }

  private reconcileDepth(): void {
    const waiting = this.ctx.storage.sql
      .exec<{ count: number }>(`SELECT COUNT(*) AS count FROM visitors WHERE status = 'waiting'`)
      .one().count;
    const admitted = this.ctx.storage.sql
      .exec<{ count: number }>(`SELECT COUNT(*) AS count FROM visitors WHERE status = 'admitted'`)
      .one().count;
    this.depth = { waiting, admitted };
    this.setMeta("count_waiting", String(waiting));
    this.setMeta("count_admitted", String(admitted));
    this.aheadCache.clear();
  }

  private bumpDepth(waitingDelta: number, admittedDelta: number): void {
    this.ensureDepth();
    this.depth = {
      waiting: Math.max(0, this.depth!.waiting + waitingDelta),
      admitted: Math.max(0, this.depth!.admitted + admittedDelta),
    };
    this.setMeta("count_waiting", String(this.depth.waiting));
    this.setMeta("count_admitted", String(this.depth.admitted));
  }

  private toView(visitor: VisitorRow, config: QueueConfig, now: number) {
    const status = visitor.status as "waiting" | "admitted" | "expired" | "left";
    const mode = this.admissionMode(config);
    const waiting = this.countByStatus("waiting");
    let position: number | null = null;
    let estimatedWaitSeconds = 0;
    let lotteryOdds: number | null = null;
    let ahead: number | null = null;
    let behind: number | null = null;
    const entered = visitor.entered !== 0 && visitor.entered !== null;
    let holdSecondsRemaining: number | null = null;

    if (status === "waiting") {
      if (mode === "lottery") {
        lotteryOdds = waiting > 0 ? 1 / waiting : null;
        estimatedWaitSeconds = defaultEtaCalculator.estimateWaitSeconds(waiting, {
          ...config,
          admitPerSecond: Math.max(this.effectiveAdmitPerSecond(config, now), 0.0001),
        });
      } else {
        position = waitingPosition(this.waitingAhead(visitor.sequence));
        ahead = position - 1;
        behind = Math.max(0, waiting - position);
        estimatedWaitSeconds = defaultEtaCalculator.estimateWaitSeconds(position, {
          ...config,
          admitPerSecond: Math.max(this.effectiveAdmitPerSecond(config, now), 0.0001),
        });
      }
    }

    if (status === "admitted" && !entered && visitor.admitted_at !== null) {
      const holdMs = this.effectiveConfig(config).admitHoldSeconds * 1000;
      holdSecondsRemaining = Math.max(0, Math.ceil((visitor.admitted_at + holdMs - now) / 1000));
    }

    const showDepth = this.showWaitingCount();
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
      entered,
      holdSecondsRemaining,
      showWaitingCount: showDepth,
    };
  }

  private rememberConfig(config: QueueConfig): void {
    const encoded = JSON.stringify(config);
    if (this.getMeta("config") === encoded) {
      return;
    }
    this.setMeta("config", encoded);
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

  private isManualPaused(): boolean {
    return this.getMeta("paused") === "1";
  }

  private getOpensAt(): number | null {
    const raw = this.getMeta("opens_at");
    if (!raw) {
      return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private showWaitingCount(): boolean {
    return this.getMeta("show_waiting_count") === "1";
  }

  private canAdmit(now: number): boolean {
    if (this.isManualPaused()) {
      return false;
    }
    const opensAt = this.getOpensAt();
    if (opensAt !== null && now < opensAt) {
      return false;
    }
    const health = this.readHealthConfig();
    const state = this.readHealthState();
    if (isAutoPaused(health, state, now)) {
      return false;
    }
    return true;
  }

  private effectiveAdmitPerSecond(config: QueueConfig, now: number): number {
    if (!this.canAdmit(now)) {
      return 0;
    }
    const mult = healthRateMultiplier(this.readHealthConfig(), this.readHealthState(), now);
    return config.admitPerSecond * mult;
  }

  private readHealthConfig(): OriginHealthConfig {
    const raw = this.getMeta("health_config");
    if (!raw) {
      return { ...DEFAULT_HEALTH_CONFIG };
    }
    try {
      return parseHealthConfig(JSON.parse(raw) as Partial<OriginHealthConfig>);
    } catch {
      return { ...DEFAULT_HEALTH_CONFIG };
    }
  }

  private readHealthState(): OriginHealthState {
    const raw = this.getMeta("health_state");
    if (!raw) {
      return { ...DEFAULT_HEALTH_STATE };
    }
    try {
      return { ...DEFAULT_HEALTH_STATE, ...(JSON.parse(raw) as Partial<OriginHealthState>) };
    } catch {
      return { ...DEFAULT_HEALTH_STATE };
    }
  }

  private healthSnapshot(now: number): QueueMetricsResponse["health"] {
    const config = this.readHealthConfig();
    const state = this.readHealthState();
    return {
      enabled: config.enabled,
      level: state.level,
      lastCheckedAt: state.lastCheckedAt,
      lastLatencyMs: state.lastLatencyMs,
      lastStatus: state.lastStatus,
      lastError: state.lastError,
      overrideUntil: config.overrideUntil,
      autoPaused: isAutoPaused(config, state, now),
    };
  }

  private async maybeProbeHealth(now: number): Promise<void> {
    const config = this.readHealthConfig();
    if (!config.enabled || !config.url) {
      return;
    }
    const state = this.readHealthState();
    if (state.lastCheckedAt && now - state.lastCheckedAt < config.intervalSeconds * 1000) {
      return;
    }
    const probe = await probeOriginHealth(config);
    const next = advanceHealthState(config, state, probe, now);
    this.setMeta("health_state", JSON.stringify(next));
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
   * Schedule the next sweep while the room has work, or health probes are enabled.
   */
  private async ensureAlarm(): Promise<void> {
    const waiting = this.countByStatus("waiting");
    const admitted = this.countByStatus("admitted");
    const health = this.readHealthConfig();
    const opensAt = this.getOpensAt();
    const waitingForOpen = opensAt !== null && Date.now() < opensAt && waiting > 0;

    if (waiting === 0 && admitted === 0 && !health.enabled && !waitingForOpen) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const existing = await this.ctx.storage.getAlarm();
    let interval = Math.max(QUEUE_ALARM_INTERVAL_MS * 15, 15_000);
    if (waiting > 0 && this.canAdmit(Date.now())) {
      interval = QUEUE_ALARM_INTERVAL_MS;
    } else if (waiting > 0) {
      interval = Math.min(5_000, interval);
    }
    if (health.enabled) {
      interval = Math.min(interval, health.intervalSeconds * 1000);
    }
    const nextAt = Date.now() + interval;

    if (existing === null || existing > nextAt + 250) {
      await this.ctx.storage.setAlarm(nextAt);
    }
  }
}
