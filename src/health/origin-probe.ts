/**
 * Origin health probes for graduated admission throttling.
 */

import { isBlockedOriginHost, normalizeOriginUrl } from "../core/origin";

export type HealthLevel = "ok" | "slow" | "pause";

export interface OriginHealthConfig {
  enabled: boolean;
  url: string | null;
  intervalSeconds: number;
  timeoutMs: number;
  maxLatencyMs: number;
  expectStatus: number;
  failThreshold: number;
  recoverThreshold: number;
  slowRateMultiplier: number;
  /** When set and in the future, treat health as ok for gating. */
  overrideUntil: number | null;
}

export interface OriginHealthState {
  level: HealthLevel;
  consecutiveFails: number;
  consecutiveOk: number;
  lastCheckedAt: number | null;
  lastLatencyMs: number | null;
  lastStatus: number | null;
  lastError: string | null;
}

export const DEFAULT_HEALTH_CONFIG: OriginHealthConfig = {
  enabled: false,
  url: null,
  intervalSeconds: 30,
  timeoutMs: 5_000,
  maxLatencyMs: 3_000,
  expectStatus: 200,
  failThreshold: 2,
  recoverThreshold: 2,
  slowRateMultiplier: 0.25,
  overrideUntil: null,
};

export const DEFAULT_HEALTH_STATE: OriginHealthState = {
  level: "ok",
  consecutiveFails: 0,
  consecutiveOk: 0,
  lastCheckedAt: null,
  lastLatencyMs: null,
  lastStatus: null,
  lastError: null,
};

export function sanitizeHealthUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (isBlockedOriginHost(url.hostname)) {
    return null;
  }
  return url.toString();
}

/** Build a default probe URL from an origin base (e.g. https://shop + /health). */
export function defaultHealthUrlFromOrigin(originUrl: string | null | undefined): string | null {
  const base = normalizeOriginUrl(originUrl ?? "");
  if (!base) {
    return null;
  }
  return `${base}/health`;
}

export function parseHealthConfig(
  raw: Partial<OriginHealthConfig> | null | undefined,
): OriginHealthConfig {
  const base = raw ? { ...DEFAULT_HEALTH_CONFIG, ...raw } : { ...DEFAULT_HEALTH_CONFIG };
  const url = sanitizeHealthUrl(base.url);
  return {
    enabled: Boolean(base.enabled) && url !== null,
    url,
    intervalSeconds: clampInt(base.intervalSeconds, 15, 300, 30),
    timeoutMs: clampInt(base.timeoutMs, 500, 15_000, 5_000),
    maxLatencyMs: clampInt(base.maxLatencyMs, 100, 30_000, 3_000),
    expectStatus: clampInt(base.expectStatus, 100, 599, 200),
    failThreshold: clampInt(base.failThreshold, 1, 20, 2),
    recoverThreshold: clampInt(base.recoverThreshold, 1, 20, 2),
    slowRateMultiplier: clampFloat(base.slowRateMultiplier, 0.01, 1, 0.25),
    overrideUntil:
      typeof base.overrideUntil === "number" && Number.isFinite(base.overrideUntil)
        ? base.overrideUntil
        : null,
  };
}

export function healthRateMultiplier(
  config: OriginHealthConfig,
  state: OriginHealthState,
  now: number,
): number {
  if (!config.enabled) {
    return 1;
  }
  if (config.overrideUntil !== null && now < config.overrideUntil) {
    return 1;
  }
  if (state.level === "pause") {
    return 0;
  }
  if (state.level === "slow") {
    return config.slowRateMultiplier;
  }
  return 1;
}

export function isAutoPaused(
  config: OriginHealthConfig,
  state: OriginHealthState,
  now: number,
): boolean {
  return config.enabled && healthRateMultiplier(config, state, now) === 0;
}

export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  status: number | null;
  error: string | null;
}

export async function probeOriginHealth(
  config: OriginHealthConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  if (!config.url) {
    return { ok: false, latencyMs: 0, status: null, error: "Health URL not configured" };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "TideGuard-HealthProbe/1.0" },
    });
    const latencyMs = Date.now() - started;
    const statusOk = response.status === config.expectStatus;
    const latencyOk = latencyMs <= config.maxLatencyMs;
    // Drain body so the connection can close cleanly.
    await response.arrayBuffer().catch(() => undefined);
    if (!statusOk) {
      return {
        ok: false,
        latencyMs,
        status: response.status,
        error: `Unexpected status ${response.status}`,
      };
    }
    if (!latencyOk) {
      return {
        ok: false,
        latencyMs,
        status: response.status,
        error: `Latency ${latencyMs}ms exceeds ${config.maxLatencyMs}ms`,
      };
    }
    return { ok: true, latencyMs, status: response.status, error: null };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const message = error instanceof Error ? error.message : "Probe failed";
    return { ok: false, latencyMs, status: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export function advanceHealthState(
  config: OriginHealthConfig,
  prev: OriginHealthState,
  probe: ProbeResult,
  now: number,
): OriginHealthState {
  const next: OriginHealthState = {
    ...prev,
    lastCheckedAt: now,
    lastLatencyMs: probe.latencyMs,
    lastStatus: probe.status,
    lastError: probe.error,
  };

  if (probe.ok) {
    next.consecutiveOk = prev.consecutiveOk + 1;
    next.consecutiveFails = 0;
    if (prev.level !== "ok" && next.consecutiveOk >= config.recoverThreshold) {
      next.level = "ok";
      next.consecutiveOk = 0;
    }
    return next;
  }

  next.consecutiveFails = prev.consecutiveFails + 1;
  next.consecutiveOk = 0;

  if (prev.level === "ok" && next.consecutiveFails >= config.failThreshold) {
    next.level = "slow";
    next.consecutiveFails = 0;
  } else if (prev.level === "slow" && next.consecutiveFails >= config.failThreshold) {
    next.level = "pause";
    next.consecutiveFails = 0;
  }

  return next;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  if (n < min || n > max) return fallback;
  return n;
}

function clampFloat(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}
