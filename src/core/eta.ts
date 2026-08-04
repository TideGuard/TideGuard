import type { QueueConfig } from "./types";

/**
 * Pluggable wait-time estimator.
 *
 * v1: queue-length / admission-rate setpoint.
 * v1.5: optional blend with recent observed admit throughput (rolling window).
 */
export interface EtaCalculator {
  estimateWaitSeconds(waitingCount: number, config: QueueConfig): number;
}

export class SimpleEtaCalculator implements EtaCalculator {
  estimateWaitSeconds(waitingCount: number, config: QueueConfig): number {
    if (waitingCount <= 0) {
      return 0;
    }
    if (config.admitPerSecond <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.ceil(waitingCount / config.admitPerSecond);
  }
}

/**
 * Blends the configured admit rate with recent observed throughput.
 * When observation is missing, behaves like SimpleEtaCalculator.
 * When observation is present, never estimates faster than the setpoint
 * (conservative: visitors are not promised more than operators configured).
 */
export class RollingThroughputEtaCalculator implements EtaCalculator {
  constructor(
    private readonly observedAdmitPerSecond: number | null = null,
    private readonly observedWeight = 0.5,
  ) {}

  estimateWaitSeconds(waitingCount: number, config: QueueConfig): number {
    if (waitingCount <= 0) {
      return 0;
    }
    const setpoint = config.admitPerSecond;
    if (setpoint <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    const observed = this.observedAdmitPerSecond;
    let rate = setpoint;
    if (observed !== null && Number.isFinite(observed) && observed > 0) {
      const w = Math.min(1, Math.max(0, this.observedWeight));
      const blended = setpoint * (1 - w) + observed * w;
      rate = Math.min(setpoint, blended);
    }
    return Math.ceil(waitingCount / Math.max(rate, 0.0001));
  }
}

export function createEtaCalculator(observedAdmitPerSecond: number | null = null): EtaCalculator {
  return new RollingThroughputEtaCalculator(observedAdmitPerSecond);
}

/** Default when no live observation is available (setpoint-only). */
export const defaultEtaCalculator: EtaCalculator = new RollingThroughputEtaCalculator(null);
