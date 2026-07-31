/**
 * Origin-health config/state persistence helpers for QueueRoom.
 */

import {
  DEFAULT_HEALTH_CONFIG,
  DEFAULT_HEALTH_STATE,
  advanceHealthState,
  isAutoPaused,
  parseHealthConfig,
  probeOriginHealth,
  type OriginHealthConfig,
  type OriginHealthState,
} from "../health/origin-probe";
import type { QueueMetricsResponse } from "../queue/types";
import type { MetaAccess } from "./schema";

export function readHealthConfig(getMeta: MetaAccess["getMeta"]): OriginHealthConfig {
  const raw = getMeta("health_config");
  if (!raw) {
    return { ...DEFAULT_HEALTH_CONFIG };
  }
  try {
    return parseHealthConfig(JSON.parse(raw) as Partial<OriginHealthConfig>);
  } catch {
    return { ...DEFAULT_HEALTH_CONFIG };
  }
}

export function readHealthState(getMeta: MetaAccess["getMeta"]): OriginHealthState {
  const raw = getMeta("health_state");
  if (!raw) {
    return { ...DEFAULT_HEALTH_STATE };
  }
  try {
    return { ...DEFAULT_HEALTH_STATE, ...(JSON.parse(raw) as Partial<OriginHealthState>) };
  } catch {
    return { ...DEFAULT_HEALTH_STATE };
  }
}

export function healthSnapshot(
  now: number,
  getMeta: MetaAccess["getMeta"],
): QueueMetricsResponse["health"] {
  const config = readHealthConfig(getMeta);
  const state = readHealthState(getMeta);
  return {
    enabled: config.enabled,
    level: state.level,
    lastCheckedAt: state.lastCheckedAt,
    lastLatencyMs: state.lastLatencyMs,
    lastStatus: state.lastStatus,
    lastError: state.lastError,
    overrideUntil: config.overrideUntil,
    autoPaused: isAutoPaused(config, state, now),
  };
}

export async function maybeProbeHealth(now: number, meta: MetaAccess): Promise<void> {
  const config = readHealthConfig(meta.getMeta);
  if (!config.enabled || !config.url) {
    return;
  }
  const state = readHealthState(meta.getMeta);
  if (state.lastCheckedAt && now - state.lastCheckedAt < config.intervalSeconds * 1000) {
    return;
  }
  const probe = await probeOriginHealth(config);
  const next = advanceHealthState(config, state, probe, now);
  meta.setMeta("health_state", JSON.stringify(next));
}
