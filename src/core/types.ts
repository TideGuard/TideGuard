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
}

export interface JoinResult {
  visitorId: VisitorId;
  status: QueueVisitorStatus;
  position: number | null;
  estimatedWaitSeconds: number;
  admissionMode: AdmissionMode;
  /** Current waiting-room depth (everyone still waiting, including this visitor). */
  waiting: number;
  /** Queue Mode while waiting: people ahead of you (`position - 1`). */
  ahead?: number;
  /** Queue Mode while waiting: people behind you (`waiting - position`). */
  behind?: number;
  /** Present in lottery mode while waiting: chance of being next (1 / waiting). */
  lotteryOdds?: number;
  accessToken?: string;
}

export interface StatusResult {
  visitorId: VisitorId;
  status: QueueVisitorStatus;
  position: number | null;
  estimatedWaitSeconds: number;
  admissionMode: AdmissionMode;
  waiting: number;
  ahead?: number;
  behind?: number;
  lotteryOdds?: number;
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
