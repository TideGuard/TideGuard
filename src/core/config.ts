import type { AdmissionMode, QueueConfig } from "./types";

export class ConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid TideGuard configuration: ${issues.join("; ")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

const POSITIVE_INT = Number.isInteger;

export type QueueConfigEnv = {
  MAX_CONCURRENT_USERS?: string;
  ADMIT_PER_SECOND?: string;
  TOKEN_TTL_SECONDS?: string;
  HEARTBEAT_TIMEOUT_SECONDS?: string;
  QUEUE_TIMEOUT_SECONDS?: string;
  ADMISSION_MODE?: string;
};

/**
 * Parse and validate queue settings from Worker environment variables.
 * Missing keys fall back to DEFAULT_QUEUE_CONFIG so Deploy need not prompt for them.
 * Explicit invalid values still fail fast.
 */
export function parseQueueConfig(env: QueueConfigEnv): QueueConfig {
  const maxConcurrentUsers = envNumberOrDefault(
    env.MAX_CONCURRENT_USERS,
    DEFAULT_QUEUE_CONFIG.maxConcurrentUsers,
  );
  const admitPerSecond = envNumberOrDefault(
    env.ADMIT_PER_SECOND,
    DEFAULT_QUEUE_CONFIG.admitPerSecond,
  );
  const tokenTTLSeconds = envNumberOrDefault(
    env.TOKEN_TTL_SECONDS,
    DEFAULT_QUEUE_CONFIG.tokenTTLSeconds,
  );
  const heartbeatTimeoutSeconds = envNumberOrDefault(
    env.HEARTBEAT_TIMEOUT_SECONDS,
    DEFAULT_QUEUE_CONFIG.heartbeatTimeoutSeconds,
  );
  const queueTimeoutSeconds = envNumberOrDefault(
    env.QUEUE_TIMEOUT_SECONDS,
    DEFAULT_QUEUE_CONFIG.queueTimeoutSeconds,
  );
  const admissionMode = parseAdmissionMode(
    env.ADMISSION_MODE?.trim() ? env.ADMISSION_MODE : DEFAULT_QUEUE_CONFIG.admissionMode,
  );

  const issues: string[] = [];

  if (!POSITIVE_INT(maxConcurrentUsers) || maxConcurrentUsers < 1) {
    issues.push("MAX_CONCURRENT_USERS must be an integer >= 1");
  }
  if (!(admitPerSecond > 0) || !Number.isFinite(admitPerSecond)) {
    issues.push("ADMIT_PER_SECOND must be a number > 0");
  }
  if (!POSITIVE_INT(tokenTTLSeconds) || tokenTTLSeconds < 30) {
    issues.push("TOKEN_TTL_SECONDS must be an integer >= 30");
  }
  if (!POSITIVE_INT(heartbeatTimeoutSeconds) || heartbeatTimeoutSeconds < 10) {
    issues.push("HEARTBEAT_TIMEOUT_SECONDS must be an integer >= 10");
  }
  if (!POSITIVE_INT(queueTimeoutSeconds) || queueTimeoutSeconds < 60) {
    issues.push("QUEUE_TIMEOUT_SECONDS must be an integer >= 60");
  }
  if (
    Number.isFinite(heartbeatTimeoutSeconds) &&
    Number.isFinite(queueTimeoutSeconds) &&
    heartbeatTimeoutSeconds >= queueTimeoutSeconds
  ) {
    issues.push("HEARTBEAT_TIMEOUT_SECONDS must be less than QUEUE_TIMEOUT_SECONDS");
  }
  if (!admissionMode) {
    issues.push('ADMISSION_MODE must be "queue" or "lottery"');
  }

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  return {
    maxConcurrentUsers,
    admitPerSecond,
    tokenTTLSeconds,
    heartbeatTimeoutSeconds,
    queueTimeoutSeconds,
    admissionMode: admissionMode!,
    requireClickToEnter: false,
    admitHoldSeconds: 120,
  };
}

function envNumberOrDefault(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  return Number(raw);
}

export function parseAdmissionMode(value: unknown): AdmissionMode | null {
  if (value === "queue" || value === "lottery") {
    return value;
  }
  return null;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxConcurrentUsers: 20,
  admitPerSecond: 2,
  tokenTTLSeconds: 600,
  heartbeatTimeoutSeconds: 180,
  /** Max stay in the waiting room; deep timeslots need hours, not 30m. */
  queueTimeoutSeconds: 86_400,
  admissionMode: "queue",
  requireClickToEnter: false,
  admitHoldSeconds: 120,
};
