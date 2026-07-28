/**
 * Ballpark Cloudflare cost model for a TideGuard waiting-room event.
 *
 * Pricing constants mirror Workers Paid (Standard) + Durable Objects published
 * rates and should be updated when Cloudflare changes pricing.
 *
 * This is an estimate for planning — not an invoice. Real bills vary with
 * caching, retries, multiple queues, SQLite storage, and unused included usage.
 */

/** Published Workers Paid / Durable Objects unit rates (USD). */
export interface CloudflarePaidRates {
  /** Account minimum for Workers Paid. */
  workersPaidBaseUsd: number;
  workerRequestsIncluded: number;
  workerRequestUsdPerMillion: number;
  workerCpuMsIncluded: number;
  workerCpuUsdPerMillionMs: number;
  durableObjectRequestsIncluded: number;
  durableObjectRequestUsdPerMillion: number;
  /** Fixed 128 MB allocation used for duration GB·s. */
  durableObjectMemoryGb: number;
  durableObjectDurationGbSecondsIncluded: number;
  durableObjectDurationUsdPerMillionGbSeconds: number;
}

export const DEFAULT_CLOUDFLARE_PAID_RATES: CloudflarePaidRates = {
  workersPaidBaseUsd: 5,
  workerRequestsIncluded: 10_000_000,
  workerRequestUsdPerMillion: 0.3,
  workerCpuMsIncluded: 30_000_000,
  workerCpuUsdPerMillionMs: 0.02,
  durableObjectRequestsIncluded: 1_000_000,
  durableObjectRequestUsdPerMillion: 0.15,
  durableObjectMemoryGb: 0.128,
  durableObjectDurationGbSecondsIncluded: 400_000,
  durableObjectDurationUsdPerMillionGbSeconds: 12.5,
};

export interface CostEstimateInput {
  /** Unique visitors who enter the waiting room. */
  visitors: number;
  /** Typical time each visitor spends waiting before admission (seconds). */
  averageWaitSeconds: number;
  /** Status poll interval used by the waiting room (seconds). Default 15. */
  pollIntervalSeconds?: number;
  /** Heartbeat interval while waiting (seconds). Default 30. */
  heartbeatIntervalSeconds?: number;
  /** How long the queue Durable Object stays busy (hours). Default derived from wait. */
  activeHours?: number;
  /** Average Worker CPU ms per dynamic request. Default 3. */
  avgCpuMsPerRequest?: number;
  /** Include the $5 Workers Paid base fee in the total. Default true. */
  includeBaseFee?: boolean;
  rates?: CloudflarePaidRates;
}

export interface CostEstimateBreakdown {
  visitors: number;
  averageWaitSeconds: number;
  pollIntervalSeconds: number;
  heartbeatIntervalSeconds: number;
  statusPollsPerVisitor: number;
  heartbeatsPerVisitor: number;
  workerRequests: number;
  durableObjectRequests: number;
  workerCpuMs: number;
  durableObjectDurationGbSeconds: number;
  workerRequestUsd: number;
  workerCpuUsd: number;
  durableObjectRequestUsd: number;
  durableObjectDurationUsd: number;
  baseFeeUsd: number;
  totalUsd: number;
  /** Short note about what dominates the bill. */
  dominantCost: "polling" | "joins" | "base_fee" | "mixed";
}

function overageCost(units: number, included: number, usdPerMillion: number): number {
  const billable = Math.max(0, units - included);
  return (billable / 1_000_000) * usdPerMillion;
}

/**
 * Estimate Cloudflare spend for one waiting-room event.
 *
 * Per visitor request model (TideGuard defaults):
 * - 1× waiting page + 1× join + N× status + M× heartbeat + 1× protected page
 * - Durable Object hit on join / status / heartbeat (not on HTML page views)
 */
export function estimateWaitingRoomCost(input: CostEstimateInput): CostEstimateBreakdown {
  const rates = input.rates ?? DEFAULT_CLOUDFLARE_PAID_RATES;
  const visitors = Math.max(0, input.visitors);
  const averageWaitSeconds = Math.max(0, input.averageWaitSeconds);
  const pollIntervalSeconds = Math.max(0.5, input.pollIntervalSeconds ?? 15);
  const heartbeatIntervalSeconds = Math.max(1, input.heartbeatIntervalSeconds ?? 30);
  const avgCpuMsPerRequest = Math.max(0, input.avgCpuMsPerRequest ?? 3);
  const includeBaseFee = input.includeBaseFee !== false;

  const statusPollsPerVisitor =
    averageWaitSeconds <= 0 ? 0 : Math.ceil(averageWaitSeconds / pollIntervalSeconds);
  const heartbeatsPerVisitor =
    averageWaitSeconds <= 0 ? 0 : Math.ceil(averageWaitSeconds / heartbeatIntervalSeconds);

  // wait HTML + join + status polls + heartbeats + protected page
  const workerRequestsPerVisitor = 2 + statusPollsPerVisitor + heartbeatsPerVisitor + 1;
  const durableObjectRequestsPerVisitor = 1 + statusPollsPerVisitor + heartbeatsPerVisitor;

  const workerRequests = visitors * workerRequestsPerVisitor;
  const durableObjectRequests = visitors * durableObjectRequestsPerVisitor;
  const workerCpuMs = workerRequests * avgCpuMsPerRequest;

  const activeHours =
    input.activeHours ??
    Math.max(averageWaitSeconds / 3600, visitors > 0 ? averageWaitSeconds / 3600 : 0);
  // Keep the object warm for at least the event window when there is traffic.
  const durationSeconds = Math.max(activeHours, visitors > 0 ? 1 / 3600 : 0) * 3600;
  const durableObjectDurationGbSeconds = durationSeconds * rates.durableObjectMemoryGb;

  const workerRequestUsd = overageCost(
    workerRequests,
    rates.workerRequestsIncluded,
    rates.workerRequestUsdPerMillion,
  );
  const workerCpuUsd = overageCost(
    workerCpuMs,
    rates.workerCpuMsIncluded,
    rates.workerCpuUsdPerMillionMs,
  );
  const durableObjectRequestUsd = overageCost(
    durableObjectRequests,
    rates.durableObjectRequestsIncluded,
    rates.durableObjectRequestUsdPerMillion,
  );
  const durableObjectDurationUsd = overageCost(
    durableObjectDurationGbSeconds,
    rates.durableObjectDurationGbSecondsIncluded,
    rates.durableObjectDurationUsdPerMillionGbSeconds,
  );
  const baseFeeUsd = includeBaseFee ? rates.workersPaidBaseUsd : 0;

  const usageUsd =
    workerRequestUsd + workerCpuUsd + durableObjectRequestUsd + durableObjectDurationUsd;
  const totalUsd = usageUsd + baseFeeUsd;

  const pollingShare = statusPollsPerVisitor + heartbeatsPerVisitor;
  let dominantCost: CostEstimateBreakdown["dominantCost"] = "mixed";
  if (visitors === 0 || totalUsd <= baseFeeUsd + 0.01) {
    dominantCost = "base_fee";
  } else if (pollingShare >= 20) {
    dominantCost = "polling";
  } else if (pollingShare <= 2) {
    dominantCost = "joins";
  }

  return {
    visitors,
    averageWaitSeconds,
    pollIntervalSeconds,
    heartbeatIntervalSeconds,
    statusPollsPerVisitor,
    heartbeatsPerVisitor,
    workerRequests,
    durableObjectRequests,
    workerCpuMs,
    durableObjectDurationGbSeconds,
    workerRequestUsd,
    workerCpuUsd,
    durableObjectRequestUsd,
    durableObjectDurationUsd,
    baseFeeUsd,
    totalUsd,
    dominantCost,
  };
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value < 0.01 && value > 0) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}
