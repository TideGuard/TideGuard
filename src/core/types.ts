/**
 * Shared domain types for TideGuard.
 *
 * These contracts stay framework-agnostic so the queue core can later move
 * into a standalone npm package without rewriting callers.
 */

export type QueueName = string;

export type VisitorId = string;

export type QueueVisitorStatus = "waiting" | "admitted" | "expired" | "left";

/**
 * How waiting visitors are selected for admission.
 * - `queue`: FIFO (fair line)
 * - `lottery`: uniform random among waiters
 */
export type AdmissionMode = "queue" | "lottery";

export interface QueueConfig {
  /** Maximum visitors allowed past the waiting room at once. */
  maxConcurrentUsers: number;
  /** Steady admission rate used for ETA and automatic admit ticks. */
  admitPerSecond: number;
  /** Lifetime of a signed admission token, in seconds. */
  tokenTTLSeconds: number;
  /** Visitors without a heartbeat within this window are removed. */
  heartbeatTimeoutSeconds: number;
  /** Maximum time a visitor may remain in the waiting room. */
  queueTimeoutSeconds: number;
  /** Admission strategy for the waiting pool. */
  admissionMode: AdmissionMode;
  /**
   * When true, newly admitted visitors must confirm (POST /enter) before
   * receiving an access token. Unconfirmed admits expire after admitHoldSeconds.
   */
  requireClickToEnter: boolean;
  /** Hold window for unconfirmed admits, in seconds. */
  admitHoldSeconds: number;
}

export interface QueueVisitor {
  id: VisitorId;
  queue: QueueName;
  status: QueueVisitorStatus;
  joinedAt: number;
  lastHeartbeatAt: number;
  position: number | null;
  admittedAt: number | null;
}

export interface QueueMetrics {
  queue: QueueName;
  waiting: number;
  admitted: number;
  capacity: number;
  admitPerSecond: number;
  estimatedWaitSeconds: number;
  paused: boolean;
  admissionMode: AdmissionMode;
  /** Unix ms; null when the room is open immediately. */
  opensAt: number | null;
  /** Effective admit rate after health multiplier. */
  effectiveAdmitPerSecond: number;
  health: {
    enabled: boolean;
    level: "ok" | "slow" | "pause";
    lastCheckedAt: number | null;
    lastLatencyMs: number | null;
    lastStatus: number | null;
    lastError: string | null;
    overrideUntil: number | null;
    autoPaused: boolean;
  };
}

export interface JoinResult {
  visitorId: VisitorId;
  status: QueueVisitorStatus;
  position: number | null;
  estimatedWaitSeconds: number;
  admissionMode: AdmissionMode;
  /** Current waiting-room depth (everyone still waiting, including this visitor). */
  waiting?: number;
  /** Queue Mode while waiting: people ahead of you (`position - 1`). */
  ahead?: number;
  /** Queue Mode while waiting: people behind you (`waiting - position`). */
  behind?: number;
  /** Present in lottery mode while waiting: chance of being next (1 / waiting). */
  lotteryOdds?: number;
  /** False until POST /enter when requireClickToEnter is enabled. */
  entered?: boolean;
  /** Seconds left to confirm entry (click-to-enter mode). */
  holdSecondsRemaining?: number;
  accessToken?: string;
}

export interface StatusResult {
  visitorId: VisitorId;
  status: QueueVisitorStatus;
  position: number | null;
  estimatedWaitSeconds: number;
  admissionMode: AdmissionMode;
  /** Present only when branding `showWaitingCount` is enabled. */
  waiting?: number;
  ahead?: number;
  behind?: number;
  lotteryOdds?: number;
  entered?: boolean;
  holdSecondsRemaining?: number;
  accessToken?: string;
}

export interface HealthResponse {
  status: "ok";
  service: "tideguard";
  version: string;
  environment: string;
  time: string;
}

export type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "unauthorized"
  | "conflict"
  | "queue_full"
  | "internal_error"
  | "invalid_config";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
