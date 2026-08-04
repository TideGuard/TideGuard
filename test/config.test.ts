import { describe, expect, it } from "vitest";
import { ConfigError, parseQueueConfig } from "../src/core/config";
import { SimpleEtaCalculator, RollingThroughputEtaCalculator } from "../src/core/eta";
import { DEFAULT_QUEUE_CONFIG } from "../src/core/config";

describe("parseQueueConfig", () => {
  it("parses valid environment variables", () => {
    const config = parseQueueConfig({
      MAX_CONCURRENT_USERS: "20",
      ADMIT_PER_SECOND: "2",
      TOKEN_TTL_SECONDS: "600",
      HEARTBEAT_TIMEOUT_SECONDS: "60",
      QUEUE_TIMEOUT_SECONDS: "1800",
    });

    expect(config).toEqual({
      maxConcurrentUsers: 20,
      admitPerSecond: 2,
      tokenTTLSeconds: 600,
      heartbeatTimeoutSeconds: 60,
      queueTimeoutSeconds: 1800,
      admissionMode: "queue",
      requireClickToEnter: false,
      admitHoldSeconds: 120,
    });
  });

  it("parses lottery admission mode", () => {
    const config = parseQueueConfig({
      MAX_CONCURRENT_USERS: "20",
      ADMIT_PER_SECOND: "2",
      TOKEN_TTL_SECONDS: "600",
      HEARTBEAT_TIMEOUT_SECONDS: "60",
      QUEUE_TIMEOUT_SECONDS: "1800",
      ADMISSION_MODE: "lottery",
    });
    expect(config.admissionMode).toBe("lottery");
  });

  it("rejects invalid admission mode", () => {
    expect(() =>
      parseQueueConfig({
        MAX_CONCURRENT_USERS: "20",
        ADMIT_PER_SECOND: "2",
        TOKEN_TTL_SECONDS: "600",
        HEARTBEAT_TIMEOUT_SECONDS: "60",
        QUEUE_TIMEOUT_SECONDS: "1800",
        ADMISSION_MODE: "stack",
      }),
    ).toThrow(/ADMISSION_MODE/);
  });

  it("rejects non-positive capacity", () => {
    expect(() =>
      parseQueueConfig({
        MAX_CONCURRENT_USERS: "0",
        ADMIT_PER_SECOND: "2",
        TOKEN_TTL_SECONDS: "600",
        HEARTBEAT_TIMEOUT_SECONDS: "60",
        QUEUE_TIMEOUT_SECONDS: "1800",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects heartbeat timeout >= queue timeout", () => {
    expect(() =>
      parseQueueConfig({
        MAX_CONCURRENT_USERS: "20",
        ADMIT_PER_SECOND: "2",
        TOKEN_TTL_SECONDS: "600",
        HEARTBEAT_TIMEOUT_SECONDS: "1800",
        QUEUE_TIMEOUT_SECONDS: "1800",
      }),
    ).toThrow(/HEARTBEAT_TIMEOUT_SECONDS must be less than QUEUE_TIMEOUT_SECONDS/);
  });

  it("rejects invalid admit rate", () => {
    expect(() =>
      parseQueueConfig({
        MAX_CONCURRENT_USERS: "20",
        ADMIT_PER_SECOND: "-1",
        TOKEN_TTL_SECONDS: "600",
        HEARTBEAT_TIMEOUT_SECONDS: "60",
        QUEUE_TIMEOUT_SECONDS: "1800",
      }),
    ).toThrow(ConfigError);
  });

  it("uses DEFAULT_QUEUE_CONFIG when env keys are missing", () => {
    expect(parseQueueConfig({})).toEqual(DEFAULT_QUEUE_CONFIG);
  });
});

describe("SimpleEtaCalculator", () => {
  const eta = new SimpleEtaCalculator();

  it("returns zero when nobody is waiting", () => {
    expect(eta.estimateWaitSeconds(0, DEFAULT_QUEUE_CONFIG)).toBe(0);
  });

  it("divides waiting count by admission rate", () => {
    expect(eta.estimateWaitSeconds(137, { ...DEFAULT_QUEUE_CONFIG, admitPerSecond: 2 })).toBe(69);
  });
});

describe("RollingThroughputEtaCalculator", () => {
  it("matches setpoint when observation is missing", () => {
    const eta = new RollingThroughputEtaCalculator(null);
    expect(eta.estimateWaitSeconds(100, { ...DEFAULT_QUEUE_CONFIG, admitPerSecond: 2 })).toBe(50);
  });

  it("does not estimate faster than setpoint when observation is higher", () => {
    const eta = new RollingThroughputEtaCalculator(10, 0.5);
    expect(eta.estimateWaitSeconds(100, { ...DEFAULT_QUEUE_CONFIG, admitPerSecond: 2 })).toBe(50);
  });

  it("lengthens ETA when observation is slower than setpoint", () => {
    const eta = new RollingThroughputEtaCalculator(1, 0.5);
    expect(eta.estimateWaitSeconds(100, { ...DEFAULT_QUEUE_CONFIG, admitPerSecond: 2 })).toBe(67);
  });
});
