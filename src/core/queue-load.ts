/**
 * Planning aid for single-queue Durable Object load.
 *
 * These thresholds are conservative recommendations for TideGuard's
 * join/status/heartbeat + SQLite path — not Cloudflare hard limits.
 */

export const QUEUE_CAPACITY_THRESHOLDS = {
  /** Soft advisory: start planning load tests. */
  elevatedRps: 500,
  /** Soft advisory: may approach practical single-DO throughput. */
  highRps: 800,
  /**
   * Default recommendation for concurrently waiting clients at 15s poll / 30s heartbeat
   * (~500 background RPS) until the deployment is benchmarked.
   */
  recommendedMaxConcurrentWaiting: 5_000,
} as const;

export type QueueLoadRiskLevel = "low" | "elevated" | "high";

export interface QueueLoadInput {
  totalVisitors: number;
  peakConcurrentWaiting: number;
  statusPollIntervalSeconds: number;
  heartbeatIntervalSeconds: number;
  joinBurstDurationSeconds: number;
  /** Optional; defaults to peakConcurrentWaiting (conservative). */
  joinBurstVisitors?: number;
}

export interface QueueLoadEstimate {
  peakConcurrentWaiting: number;
  statusRps: number;
  heartbeatRps: number;
  backgroundRps: number;
  joinBurstRps: number;
  estimatedPeakRps: number;
  riskLevel: QueueLoadRiskLevel;
  architecture: "single_durable_object";
  recommendation: string;
}

const LOAD_DISCLAIMER =
  "These estimates are planning aids, not performance guarantees. Actual throughput depends on your code path, storage operations, Cloudflare limits and traffic distribution.";

export function queueLoadDisclaimer(): string {
  return LOAD_DISCLAIMER;
}

export function estimateQueueLoad(input: QueueLoadInput): QueueLoadEstimate {
  const peakConcurrentWaiting = clamp(input.peakConcurrentWaiting, 0, 10_000_000);
  const statusPollIntervalSeconds = clamp(input.statusPollIntervalSeconds, 0.5, 300);
  const heartbeatIntervalSeconds = clamp(input.heartbeatIntervalSeconds, 1, 600);
  const joinBurstDurationSeconds = clamp(input.joinBurstDurationSeconds, 1, 86_400);
  const joinBurstVisitors = clamp(
    input.joinBurstVisitors ?? peakConcurrentWaiting,
    0,
    Math.max(input.totalVisitors, peakConcurrentWaiting, 0),
  );

  const statusRps = peakConcurrentWaiting / statusPollIntervalSeconds;
  const heartbeatRps = peakConcurrentWaiting / heartbeatIntervalSeconds;
  const backgroundRps = statusRps + heartbeatRps;
  const joinBurstRps = joinBurstVisitors / joinBurstDurationSeconds;
  const estimatedPeakRps = backgroundRps + joinBurstRps;
  const riskLevel = classifyQueueLoadRisk(estimatedPeakRps);

  return {
    peakConcurrentWaiting,
    statusRps: roundRps(statusRps),
    heartbeatRps: roundRps(heartbeatRps),
    backgroundRps: roundRps(backgroundRps),
    joinBurstRps: roundRps(joinBurstRps),
    estimatedPeakRps: roundRps(estimatedPeakRps),
    riskLevel,
    architecture: "single_durable_object",
    recommendation: riskRecommendation(riskLevel),
  };
}

export function classifyQueueLoadRisk(estimatedPeakRps: number): QueueLoadRiskLevel {
  if (estimatedPeakRps >= QUEUE_CAPACITY_THRESHOLDS.highRps) {
    return "high";
  }
  if (estimatedPeakRps >= QUEUE_CAPACITY_THRESHOLDS.elevatedRps) {
    return "elevated";
  }
  return "low";
}

function riskRecommendation(level: QueueLoadRiskLevel): string {
  if (level === "high") {
    return "This scenario may approach or exceed the practical throughput of a single Durable Object. Cost estimates do not confirm production capacity. Reduce request frequency, split traffic across queues or implement sharding before relying on this configuration.";
  }
  if (level === "elevated") {
    return "This scenario may require representative load testing. Consider increasing the polling or heartbeat intervals.";
  }
  return "Estimated peak request rate is within a conservative planning band for a single queue, but always benchmark before critical events.";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function roundRps(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value >= 100) {
    return Math.round(value);
  }
  if (value >= 10) {
    return Math.round(value * 10) / 10;
  }
  return Math.round(value * 100) / 100;
}
