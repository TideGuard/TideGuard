import type { AdmissionMode, QueueConfig, QueueMetrics, QueueName } from "../core/types";
import type { OriginHealthConfig, OriginHealthState } from "../health/origin-probe";
import { defaultEtaCalculator } from "../core/eta";

export interface QueueRoomVisitorView {
  id: string;
  status: "waiting" | "admitted" | "expired" | "left";
  joinedAt: number;
  lastHeartbeatAt: number;
  admittedAt: number | null;
  position: number | null;
  estimatedWaitSeconds: number;
  admissionMode: AdmissionMode;
  /** People currently waiting (including this visitor when status is waiting). */
  waiting: number;
  /** Queue Mode only: waiters strictly ahead of you. */
  ahead: number | null;
  /** Queue Mode only: waiters strictly behind you. */
  behind: number | null;
  /** 1 / waitingCount while waiting in lottery mode. */
  lotteryOdds: number | null;
  /** True once the visitor confirmed entry (or auto-admit without click). */
  entered: boolean;
  /** Seconds left to confirm when admitted but not yet entered. */
  holdSecondsRemaining: number | null;
  /** When false, public APIs should omit depth fields. */
  showWaitingCount: boolean;
  /**
   * Suggested delay before the next status poll while waiting (adaptive).
   * Null when not waiting. Prefer `nextCheckAt` for scheduling.
   */
  nextPollAfterMs: number | null;
  /**
   * Absolute unix ms (second-aligned) when this visitor should next call /status.
   * Null when not waiting. This is the visitor's next place/ETA update.
   */
  nextCheckAt: number | null;
  /**
   * True when the opening schedule allows admission (`opensAt` null or in the past).
   * Does not reflect silent pause or origin-health throttle.
   */
  admissionOpen: boolean;
  /**
   * Future opening time (unix ms) while the room is still scheduled closed; null once open
   * or when no schedule is set.
   */
  opensAt: number | null;
}

export interface QueueJoinRequest {
  queue: QueueName;
  config: QueueConfig;
  /** Optional client-supplied id; otherwise the room generates one. */
  visitorId?: string;
  now?: number;
}

export interface QueueVisitorRequest {
  queue: QueueName;
  config: QueueConfig;
  visitorId: string;
  now?: number;
}

export interface QueueMetricsRequest {
  queue: QueueName;
  config: QueueConfig;
  now?: number;
}

export interface QueueForceAdmitRequest {
  queue: QueueName;
  config: QueueConfig;
  count?: number;
  now?: number;
}

export interface QueueSetModeRequest {
  queue: QueueName;
  config: QueueConfig;
  mode: AdmissionMode;
}

export type QueueJoinResponse = QueueRoomVisitorView;

export type QueueStatusResponse =
  { ok: true; visitor: QueueRoomVisitorView } | { ok: false; code: "not_found" };

export type QueueLeaveResponse = {
  visitorId: string;
  status: "left" | "expired" | "not_found";
};

export type QueueHeartbeatResponse =
  { ok: true; visitor: QueueRoomVisitorView } | { ok: false; code: "not_found" };

export type QueueMetricsResponse = QueueMetrics;

export type QueueForceAdmitResponse = {
  admitted: string[];
  waiting: number;
  openSlots: number;
};

export type QueueSetModeResponse = {
  admissionMode: AdmissionMode;
};

export type QueueEnterResponse =
  { ok: true; visitor: QueueRoomVisitorView } | { ok: false; code: "not_found" | "not_admitted" };

export type QueueScheduleResponse = { opensAt: number | null };

export type QueueHealthConfigResponse = {
  config: OriginHealthConfig;
  state: OriginHealthState;
};

export type QueueAdmitRateResponse = {
  admitPerSecond: number;
  admitPerSecondOverride: number | null;
  admitPerSecondDefault: number;
};

export type QueueTrafficResponse = {
  queue: QueueName;
  bucketMs: number;
  buckets: Array<{
    t: number;
    joins: number;
    admits: number;
    maxOutflow: number;
    waiting: number;
    entered: number;
  }>;
  totalInflow: number;
};

export function buildMetrics(input: {
  queue: QueueName;
  config: QueueConfig;
  waiting: number;
  admitted: number;
  entered: number;
  holding: number;
  openSlots: number;
  averageWaitSeconds: number;
  oldestWaitSeconds: number;
  paused: boolean;
  admissionMode: AdmissionMode;
  opensAt: number | null;
  effectiveAdmitPerSecond: number;
  admitPerSecondOverride: number | null;
  admitPerSecondDefault: number;
  totalInflow: number;
  inflowCurrent: number;
  outflowCurrent: number;
  health: QueueMetrics["health"];
}): QueueMetrics {
  return {
    queue: input.queue,
    waiting: input.waiting,
    admitted: input.admitted,
    entered: input.entered,
    holding: input.holding,
    openSlots: input.openSlots,
    capacity: input.config.maxConcurrentUsers,
    admitPerSecond: input.config.admitPerSecond,
    admitPerSecondOverride: input.admitPerSecondOverride,
    admitPerSecondDefault: input.admitPerSecondDefault,
    estimatedWaitSeconds: defaultEtaCalculator.estimateWaitSeconds(input.waiting, {
      ...input.config,
      admitPerSecond: Math.max(input.effectiveAdmitPerSecond, 0.0001),
    }),
    averageWaitSeconds: input.averageWaitSeconds,
    oldestWaitSeconds: input.oldestWaitSeconds,
    paused: input.paused,
    admissionMode: input.admissionMode,
    opensAt: input.opensAt,
    effectiveAdmitPerSecond: input.effectiveAdmitPerSecond,
    totalInflow: input.totalInflow,
    inflowCurrent: input.inflowCurrent,
    outflowCurrent: input.outflowCurrent,
    health: input.health,
  };
}
