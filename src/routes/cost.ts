import { estimateWaitingRoomCost } from "../core/cost-estimate";
import {
  estimateQueueLoad,
  queueLoadDisclaimer,
  QUEUE_CAPACITY_THRESHOLDS,
} from "../core/queue-load";
import { ApiError, jsonOk } from "../core/errors";
import { renderCostCalculatorPage } from "../html/cost-calculator";

export function handleCostPage(): Response {
  return new Response(renderCostCalculatorPage(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export function handleCostEstimateApi(request: Request): Response {
  const url = new URL(request.url);
  const visitors = parseNumberParam(url.searchParams.get("visitors"), 5_000_000);
  const averageWaitSeconds = parseNumberParam(url.searchParams.get("averageWaitSeconds"), 15 * 60);
  const pollIntervalSeconds = parseOptionalNumber(url.searchParams.get("pollIntervalSeconds"));
  const heartbeatIntervalSeconds = parseOptionalNumber(
    url.searchParams.get("heartbeatIntervalSeconds"),
  );
  const peakConcurrentWaiting = parseOptionalNumber(url.searchParams.get("peakConcurrentWaiting"));
  const joinBurstDurationSeconds = parseOptionalNumber(
    url.searchParams.get("joinBurstDurationSeconds"),
  );
  const joinBurstVisitors = parseOptionalNumber(url.searchParams.get("joinBurstVisitors"));

  if (visitors < 0 || averageWaitSeconds < 0) {
    throw new ApiError("bad_request", "visitors and averageWaitSeconds must be >= 0", 400);
  }

  const poll = pollIntervalSeconds ?? 15;
  const heartbeat = heartbeatIntervalSeconds ?? 30;
  const peak =
    peakConcurrentWaiting ??
    Math.min(Math.max(visitors, 0), QUEUE_CAPACITY_THRESHOLDS.recommendedMaxConcurrentWaiting);

  const estimate = estimateWaitingRoomCost({
    visitors,
    averageWaitSeconds,
    pollIntervalSeconds: poll,
    heartbeatIntervalSeconds: heartbeat,
  });

  const queueLoad = estimateQueueLoad({
    totalVisitors: visitors,
    peakConcurrentWaiting: peak,
    statusPollIntervalSeconds: poll,
    heartbeatIntervalSeconds: heartbeat,
    joinBurstDurationSeconds: joinBurstDurationSeconds ?? 60,
    ...(joinBurstVisitors !== undefined ? { joinBurstVisitors } : {}),
  });

  return jsonOk({
    estimate,
    queueLoad,
    thresholds: QUEUE_CAPACITY_THRESHOLDS,
    disclaimer: queueLoadDisclaimer(),
    costDisclaimer:
      "Ballpark Workers Paid + Durable Objects usage for a TideGuard waiting-room event. Not an invoice.",
  });
}

function parseNumberParam(value: string | null, fallback: number): number {
  if (value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new ApiError("bad_request", "Numeric query parameters must be finite numbers", 400);
  }
  return n;
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new ApiError("bad_request", "Numeric query parameters must be finite numbers", 400);
  }
  return n;
}
