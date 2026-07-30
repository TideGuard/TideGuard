export interface QueueMetrics {
  queue: string;
  waiting: number;
  admitted: number;
  entered: number;
  holding: number;
  openSlots: number;
  capacity: number;
  admitPerSecond: number;
  admitPerSecondOverride: number | null;
  admitPerSecondDefault: number;
  estimatedWaitSeconds: number;
  averageWaitSeconds: number;
  oldestWaitSeconds: number;
  paused: boolean;
  admissionMode: "queue" | "lottery";
  opensAt: number | null;
  effectiveAdmitPerSecond: number;
  totalInflow: number;
  inflowCurrent: number;
  outflowCurrent: number;
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

export interface TrafficBucket {
  t: number;
  joins: number;
  admits: number;
  maxOutflow: number;
  waiting: number;
  entered: number;
}

export interface TrafficResponse {
  ok: boolean;
  queue: string;
  bucketMs: number;
  buckets: TrafficBucket[];
  totalInflow: number;
  refreshedAt: number;
}

export interface BootstrapResponse {
  setupComplete: boolean;
  defaultQueue: string;
  version: string;
  turnstileSitekey: string | null;
  setupPending: unknown;
}

export interface AdminState {
  queue: string;
  branding: Record<string, unknown>;
  metrics: QueueMetrics;
  admissionMode: "queue" | "lottery";
  origin: Record<string, unknown>;
  bypass: Record<string, unknown>;
  geoBlock: Record<string, unknown>;
  turnstile: Record<string, unknown>;
  traffic: {
    opensAt: number | null;
    paused: boolean;
    health: QueueMetrics["health"];
    effectiveAdmitPerSecond: number;
    admitPerSecond: number;
    admitPerSecondOverride: number | null;
    admitPerSecondDefault: number;
    totalInflow: number;
    inflowCurrent: number;
    outflowCurrent: number;
    healthConfig: Record<string, unknown>;
  };
  version: string;
  me: { id: string; username: string };
  team: {
    users: Array<{ id: string; username: string; createdAt: number }>;
    invites: Array<Record<string, unknown>>;
  };
}
