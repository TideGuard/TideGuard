import type { QueueConfig } from "./types";

/**
 * Pluggable wait-time estimator.
 *
 * v1 uses a simple queue-length / admission-rate model. Swap implementations
 * later (historical throughput, percentiles, etc.) without changing callers.
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

export const defaultEtaCalculator: EtaCalculator = new SimpleEtaCalculator();
