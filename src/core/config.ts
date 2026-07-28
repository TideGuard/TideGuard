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

/**
 * Parse and validate queue settings from Worker environment variables.
 * Fails fast at the edge so misconfiguration never reaches queue logic.
 */
export function parseQueueConfig(env: {
  MAX_CONCURRENT_USERS: string;
  ADMIT_PER_SECOND: string;
  TOKEN_TTL_SECONDS: string;
  HEARTBEAT_TIMEOUT_SECONDS: string;
  QUEUE_TIMEOUT_SECONDS: string;
  ADMISSION_MODE?: string;
}): QueueConfig {
  const maxConcurrentUsers = Number(env.MAX_CONCURRENT_USERS);
  const admitPerSecond = Number(env.ADMIT_PER_SECOND);
  const tokenTTLSeconds = Number(env.TOKEN_TTL_SECONDS);
  const heartbeatTimeoutSeconds = Number(env.HEARTBEAT_TIMEOUT_SECONDS);
  const queueTimeoutSeconds = Number(env.QUEUE_TIMEOUT_SECONDS);
  const admissionMode = parseAdmissionMode(env.ADMISSION_MODE ?? "queue");

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
  };
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
  heartbeatTimeoutSeconds: 60,
  queueTimeoutSeconds: 1800,
  admissionMode: "queue",
};
