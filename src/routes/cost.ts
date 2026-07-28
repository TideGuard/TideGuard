import { estimateWaitingRoomCost } from "../core/cost-estimate";
import { ApiError } from "../core/errors";
import { jsonOk } from "../core/errors";
import { renderCostCalculatorPage } from "../html/cost-calculator";

export function handleCostPage(): Response {
  return new Response(renderCostCalculatorPage(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
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

  if (visitors < 0 || averageWaitSeconds < 0) {
    throw new ApiError("bad_request", "visitors and averageWaitSeconds must be >= 0", 400);
  }

  const estimate = estimateWaitingRoomCost({
    visitors,
    averageWaitSeconds,
    ...(pollIntervalSeconds !== undefined ? { pollIntervalSeconds } : {}),
    ...(heartbeatIntervalSeconds !== undefined ? { heartbeatIntervalSeconds } : {}),
  });

  return jsonOk({
    estimate,
    disclaimer:
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
