import {
  DEFAULT_CLOUDFLARE_PAID_RATES,
  estimateWaitingRoomCost,
  formatCount,
  formatUsd,
  type CostEstimateBreakdown,
} from "../core/cost-estimate";
import {
  QUEUE_CAPACITY_THRESHOLDS,
  estimateQueueLoad,
  queueLoadDisclaimer,
} from "../core/queue-load";
import { PRODUCT_STATUS } from "../core/product-status";

const DEFAULT_VISITORS = 5_000_000;
const DEFAULT_WAIT_MINUTES = 15;
const DEFAULT_POLL_SECONDS = 15;
const DEFAULT_HEARTBEAT_SECONDS = 30;
const DEFAULT_BURST_SECONDS = 60;
const DEFAULT_ADMISSION_RATE = 2;

function defaultPeakConcurrent(visitors: number): number {
  const capped = Math.min(Math.max(0, visitors), QUEUE_CAPACITY_THRESHOLDS.recommendedMaxConcurrentWaiting);
  return capped > 0 ? capped : QUEUE_CAPACITY_THRESHOLDS.recommendedMaxConcurrentWaiting;
}

/**
 * Interactive ballpark cost + queue-load calculator for operators.
 * Cost math lives in `src/core/cost-estimate.ts`; load math in `src/core/queue-load.ts`.
 * Client script embeds thresholds JSON and duplicates the small estimate formulas.
 */
export function renderCostCalculatorPage(): string {
  const visitors = DEFAULT_VISITORS;
  const waitMinutes = DEFAULT_WAIT_MINUTES;
  const pollSeconds = DEFAULT_POLL_SECONDS;
  const heartbeatSeconds = DEFAULT_HEARTBEAT_SECONDS;
  const peakConcurrent = defaultPeakConcurrent(visitors);
  const burstSeconds = DEFAULT_BURST_SECONDS;
  const admissionRate = DEFAULT_ADMISSION_RATE;

  const seed = estimateWaitingRoomCost({
    visitors,
    averageWaitSeconds: waitMinutes * 60,
    pollIntervalSeconds: pollSeconds,
    heartbeatIntervalSeconds: heartbeatSeconds,
  });
  const loadSeed = estimateQueueLoad({
    totalVisitors: visitors,
    peakConcurrentWaiting: peakConcurrent,
    statusPollIntervalSeconds: pollSeconds,
    heartbeatIntervalSeconds: heartbeatSeconds,
    joinBurstDurationSeconds: burstSeconds,
  });

  const ratesJson = JSON.stringify(DEFAULT_CLOUDFLARE_PAID_RATES);
  const thresholdsJson = JSON.stringify(QUEUE_CAPACITY_THRESHOLDS);
  const disclaimer = queueLoadDisclaimer();
  const architectureLabel = "Single Durable Object";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Calculate cost · TideGuard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,550;9..144,650&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #07151c;
        --surface: #0b1f2a;
        --text: #e8f1f5;
        --muted: #8aa4b0;
        --accent: #2bb0a6;
        --accent-2: #3dd6c8;
        --line: color-mix(in oklab, var(--text) 14%, transparent);
        --warn: #e2b15c;
        --danger: #d9776c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Source Sans 3", "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(ellipse 70% 50% at 0% 0%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 55%),
          linear-gradient(165deg, var(--bg), var(--surface) 60%, #123041);
      }
      a { color: var(--accent-2); }
      .wrap {
        width: min(100% - 2rem, 56rem);
        margin: 0 auto;
        padding: 2rem 0 3.5rem;
      }
      .top {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: baseline;
        margin-bottom: 1.75rem;
      }
      .brand {
        margin: 0;
        font-size: 0.85rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .badge {
        display: inline-block;
        margin-left: 0.55rem;
        padding: 0.15rem 0.45rem;
        border: 1px solid color-mix(in oklab, var(--accent) 55%, transparent);
        border-radius: 0.35rem;
        font-size: 0.72rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--accent-2);
        vertical-align: middle;
      }
      h1 {
        margin: 0 0 0.6rem;
        font-family: "Fraunces", Georgia, serif;
        font-weight: 650;
        font-size: clamp(2rem, 5vw, 2.8rem);
        letter-spacing: -0.02em;
        text-wrap: balance;
      }
      .lede {
        margin: 0 0 1.75rem;
        max-width: 48ch;
        color: var(--muted);
        line-height: 1.55;
        text-wrap: pretty;
      }
      .layout {
        display: grid;
        gap: 1.5rem;
      }
      @media (min-width: 860px) {
        .layout { grid-template-columns: 1.05fr 0.95fr; align-items: start; }
      }
      .panel {
        border-top: 1px solid var(--line);
        padding-top: 1.1rem;
      }
      .panel h2 {
        margin: 0 0 1rem;
        font-family: "Fraunces", Georgia, serif;
        font-size: 1.2rem;
        font-weight: 550;
      }
      label {
        display: grid;
        gap: 0.35rem;
        margin-bottom: 1rem;
        font-size: 0.92rem;
      }
      label span { color: var(--muted); }
      label .hint {
        font-size: 0.8rem;
        color: color-mix(in oklab, var(--muted) 85%, transparent);
      }
      input {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 0.4rem;
        background: color-mix(in oklab, var(--bg) 70%, black);
        color: var(--text);
        font: inherit;
        padding: 0.65rem 0.75rem;
      }
      input:focus {
        outline: 2px solid color-mix(in oklab, var(--accent) 65%, transparent);
        outline-offset: 1px;
      }
      .presets {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 0 0 1rem;
      }
      .presets button {
        border: 1px solid var(--line);
        background: transparent;
        color: var(--text);
        font: inherit;
        font-size: 0.85rem;
        padding: 0.4rem 0.7rem;
        border-radius: 999px;
        cursor: pointer;
      }
      .presets button:hover,
      .presets button[aria-pressed="true"] {
        border-color: color-mix(in oklab, var(--accent) 70%, transparent);
        color: var(--accent-2);
      }
      .presets button:focus-visible {
        outline: 2px solid color-mix(in oklab, var(--accent) 65%, transparent);
        outline-offset: 2px;
      }
      .hero-cost {
        font-family: "Fraunces", Georgia, serif;
        font-size: clamp(2.4rem, 6vw, 3.4rem);
        font-weight: 650;
        letter-spacing: -0.02em;
        margin: 0.2rem 0 0.35rem;
        font-variant-numeric: tabular-nums;
      }
      .hero-note {
        margin: 0 0 1.25rem;
        color: var(--muted);
        font-size: 0.95rem;
      }
      .rows {
        display: grid;
        gap: 0.65rem;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        font-variant-numeric: tabular-nums;
        border-bottom: 1px solid var(--line);
        padding-bottom: 0.55rem;
      }
      .row .k { color: var(--muted); }
      .callout {
        margin-top: 1.25rem;
        padding: 0.85rem 0.9rem;
        border-left: 3px solid var(--accent);
        background: color-mix(in oklab, var(--accent) 10%, transparent);
        color: var(--muted);
        line-height: 1.45;
      }
      .callout[data-tone="polling"] { border-left-color: var(--warn); }
      .load-grid {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
        margin-bottom: 1rem;
      }
      .load-card {
        border-top: 1px solid var(--line);
        padding-top: 0.5rem;
      }
      .load-card .label {
        display: block;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
        margin-bottom: 0.2rem;
      }
      .load-card .value {
        font-size: 1.2rem;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .risk[data-tone="low"] { color: var(--accent); }
      .risk[data-tone="elevated"] { color: var(--warn); }
      .risk[data-tone="high"] { color: var(--danger); }
      .recommendation {
        margin: 0 0 1rem;
        padding: 0.85rem 0.9rem;
        border-left: 3px solid var(--warn);
        background: color-mix(in oklab, var(--warn) 10%, transparent);
        color: var(--muted);
        line-height: 1.45;
      }
      .recommendation[data-tone="high"] {
        border-left-color: var(--danger);
        background: color-mix(in oklab, var(--danger) 10%, transparent);
      }
      .recommendation[hidden] { display: none; }
      .disclaimer {
        margin: 0;
        font-size: 0.85rem;
        color: var(--muted);
        line-height: 1.5;
      }
      .fine {
        margin-top: 1.5rem;
        font-size: 0.85rem;
        color: var(--muted);
        line-height: 1.5;
      }
      code { font-size: 0.9em; color: var(--text); }
      .stack { display: grid; gap: 1.5rem; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="top">
        <p class="brand">TideGuard <span class="badge">${PRODUCT_STATUS.label}</span></p>
        <a href="/">Home</a>
      </div>
      <h1>Calculate cost</h1>
      <p class="lede">
        Ballpark Cloudflare spend and single-queue load for a waiting-room event. Polling while people wait usually dominates cost — not the join itself.
      </p>

      <div class="layout">
        <section class="panel" aria-labelledby="inputs-title">
          <h2 id="inputs-title">Event size</h2>
          <div class="presets" role="group" aria-label="Presets">
            <button type="button" data-preset="short">5M · 2 min wait</button>
            <button type="button" data-preset="medium" aria-pressed="true">5M · 15 min wait</button>
            <button type="button" data-preset="long">5M · 60 min wait</button>
            <button type="button" data-preset="small">100k · 5 min wait</button>
          </div>
          <label for="visitors">
            <span>Total visitors</span>
            <input id="visitors" name="visitors" type="number" inputmode="numeric" min="0" step="1000" value="${visitors}" aria-describedby="visitors-hint" />
            <span class="hint" id="visitors-hint">Unique visitors who enter the waiting room</span>
          </label>
          <label for="peakConcurrent">
            <span>Peak concurrently waiting users</span>
            <input id="peakConcurrent" name="peakConcurrent" type="number" inputmode="numeric" min="0" step="100" value="${peakConcurrent}" aria-describedby="peak-hint" />
            <span class="hint" id="peak-hint">Used for status/heartbeat RPS (planning default caps at ${formatCount(QUEUE_CAPACITY_THRESHOLDS.recommendedMaxConcurrentWaiting)})</span>
          </label>
          <label for="waitMinutes">
            <span>Average wait (minutes)</span>
            <input id="waitMinutes" name="waitMinutes" type="number" inputmode="decimal" min="0" step="1" value="${waitMinutes}" aria-describedby="wait-hint" />
            <span class="hint" id="wait-hint">Drives the cost model (polls and heartbeats per visitor)</span>
          </label>
          <label for="pollSeconds">
            <span>Status poll interval (seconds)</span>
            <input id="pollSeconds" name="pollSeconds" type="number" inputmode="decimal" min="0.5" step="0.5" value="${pollSeconds}" />
          </label>
          <label for="heartbeatSeconds">
            <span>Heartbeat interval (seconds)</span>
            <input id="heartbeatSeconds" name="heartbeatSeconds" type="number" inputmode="numeric" min="1" step="1" value="${heartbeatSeconds}" />
          </label>
          <label for="burstSeconds">
            <span>Join burst duration (seconds)</span>
            <input id="burstSeconds" name="burstSeconds" type="number" inputmode="numeric" min="1" step="1" value="${burstSeconds}" aria-describedby="burst-hint" />
            <span class="hint" id="burst-hint">How long the initial join rush is spread over</span>
          </label>
          <label for="admissionRate">
            <span>Admission rate per second</span>
            <input id="admissionRate" name="admissionRate" type="number" inputmode="decimal" min="0" step="0.5" value="${admissionRate}" aria-describedby="admission-hint" />
            <span class="hint" id="admission-hint">Informational only — queue load uses join burst, not admission rate</span>
          </label>
        </section>

        <div class="stack">
          <section class="panel" aria-labelledby="result-title" aria-live="polite">
            <h2 id="result-title">Estimated total</h2>
            <p class="hero-cost" id="total">${formatUsd(seed.totalUsd)}</p>
            <p class="hero-note" id="summary">Including Workers Paid base fee. Usage beyond included monthly allotments.</p>
            <div class="rows" id="rows"></div>
            <p class="callout" id="callout" data-tone="${seed.dominantCost}"></p>
          </section>

          <section class="panel" aria-labelledby="load-title" aria-live="polite">
            <h2 id="load-title">Estimated queue load</h2>
            <div class="load-grid" id="load-grid">
              <div class="load-card">
                <span class="label">Peak concurrently waiting</span>
                <span class="value" id="load-peak">${formatCount(loadSeed.peakConcurrentWaiting)}</span>
              </div>
              <div class="load-card">
                <span class="label">Status RPS</span>
                <span class="value" id="load-status">${formatRps(loadSeed.statusRps)}</span>
              </div>
              <div class="load-card">
                <span class="label">Heartbeat RPS</span>
                <span class="value" id="load-heartbeat">${formatRps(loadSeed.heartbeatRps)}</span>
              </div>
              <div class="load-card">
                <span class="label">Join burst RPS</span>
                <span class="value" id="load-join">${formatRps(loadSeed.joinBurstRps)}</span>
              </div>
              <div class="load-card">
                <span class="label">Estimated peak RPS</span>
                <span class="value" id="load-peak-rps">${formatRps(loadSeed.estimatedPeakRps)}</span>
              </div>
              <div class="load-card">
                <span class="label">Architecture</span>
                <span class="value" id="load-arch">${architectureLabel}</span>
              </div>
              <div class="load-card">
                <span class="label">Risk level</span>
                <span class="value risk" id="load-risk" data-tone="${loadSeed.riskLevel}">${capitalize(loadSeed.riskLevel)}</span>
              </div>
            </div>
            <p class="recommendation" id="recommendation" data-tone="${loadSeed.riskLevel}" ${loadSeed.riskLevel === "low" ? "hidden" : ""}>${escapeHtml(loadSeed.recommendation)}</p>
            <p class="disclaimer" id="disclaimer">${escapeHtml(disclaimer)}</p>
            <p class="fine" style="margin-top: 0.85rem;">
              See capacity planning docs in the repo (<code>docs/capacity-planning.md</code>).
            </p>
          </section>
        </div>
      </div>

      <p class="fine">
        Model source: <code>src/core/cost-estimate.ts</code> and <code>src/core/queue-load.ts</code>.
        Also available as JSON at <a href="/api/cost-estimate?visitors=5000000&amp;averageWaitSeconds=900"><code>/api/cost-estimate</code></a>.
        Rates are Workers Paid + Durable Objects list prices and may change. Excludes origin hosting and SQLite storage overages.
      </p>
    </div>

    <script id="cost-rates" type="application/json">${ratesJson}</script>
    <script id="queue-thresholds" type="application/json">${thresholdsJson}</script>
    <script>
      (() => {
        const rates = JSON.parse(document.getElementById("cost-rates").textContent);
        const thresholds = JSON.parse(document.getElementById("queue-thresholds").textContent);

        const visitorsInput = document.getElementById("visitors");
        const peakInput = document.getElementById("peakConcurrent");
        const waitInput = document.getElementById("waitMinutes");
        const pollInput = document.getElementById("pollSeconds");
        const heartbeatInput = document.getElementById("heartbeatSeconds");
        const burstInput = document.getElementById("burstSeconds");
        const admissionInput = document.getElementById("admissionRate");

        const totalEl = document.getElementById("total");
        const rowsEl = document.getElementById("rows");
        const calloutEl = document.getElementById("callout");

        const loadPeakEl = document.getElementById("load-peak");
        const loadStatusEl = document.getElementById("load-status");
        const loadHeartbeatEl = document.getElementById("load-heartbeat");
        const loadJoinEl = document.getElementById("load-join");
        const loadPeakRpsEl = document.getElementById("load-peak-rps");
        const loadRiskEl = document.getElementById("load-risk");
        const recommendationEl = document.getElementById("recommendation");
        const presets = document.querySelectorAll("[data-preset]");

        function clamp(value, min, max) {
          if (!Number.isFinite(value)) return min;
          return Math.min(max, Math.max(min, value));
        }

        function roundRps(value) {
          if (!Number.isFinite(value)) return 0;
          if (value >= 100) return Math.round(value);
          if (value >= 10) return Math.round(value * 10) / 10;
          return Math.round(value * 100) / 100;
        }

        function riskRecommendation(level) {
          if (level === "high") {
            return "This scenario may approach or exceed the practical throughput of a single Durable Object. Cost estimates do not confirm production capacity. Reduce request frequency, split traffic across queues or implement sharding before relying on this configuration.";
          }
          if (level === "elevated") {
            return "This scenario may require representative load testing. Consider increasing the polling or heartbeat intervals.";
          }
          return "Estimated peak request rate is within a conservative planning band for a single queue, but always benchmark before critical events.";
        }

        function classifyQueueLoadRisk(estimatedPeakRps) {
          if (estimatedPeakRps >= thresholds.highRps) return "high";
          if (estimatedPeakRps >= thresholds.elevatedRps) return "elevated";
          return "low";
        }

        /** Mirrors src/core/queue-load.ts estimateQueueLoad using embedded thresholds. */
        function estimateQueueLoadClient(input) {
          const peakConcurrentWaiting = clamp(input.peakConcurrentWaiting, 0, 10_000_000);
          const statusPollIntervalSeconds = clamp(input.statusPollIntervalSeconds, 0.5, 300);
          const heartbeatIntervalSeconds = clamp(input.heartbeatIntervalSeconds, 1, 600);
          const joinBurstDurationSeconds = clamp(input.joinBurstDurationSeconds, 1, 86_400);
          const joinBurstVisitors = clamp(
            input.joinBurstVisitors != null ? input.joinBurstVisitors : peakConcurrentWaiting,
            0,
            Math.max(input.totalVisitors, peakConcurrentWaiting, 0),
          );

          const statusRps = peakConcurrentWaiting / statusPollIntervalSeconds;
          const heartbeatRps = peakConcurrentWaiting / heartbeatIntervalSeconds;
          const backgroundRps = statusRps + heartbeatRps;
          const joinBurstRps = joinBurstVisitors / joinBurstDurationSeconds;
          const estimatedPeakRps = backgroundRps + joinBurstRps;
          const riskLevel = classifyQueueLoadRisk(estimatedPeakRps);

          return {
            peakConcurrentWaiting,
            statusRps: roundRps(statusRps),
            heartbeatRps: roundRps(heartbeatRps),
            backgroundRps: roundRps(backgroundRps),
            joinBurstRps: roundRps(joinBurstRps),
            estimatedPeakRps: roundRps(estimatedPeakRps),
            riskLevel,
            architecture: "single_durable_object",
            recommendation: riskRecommendation(riskLevel),
          };
        }

        function overageCost(units, included, usdPerMillion) {
          const billable = Math.max(0, units - included);
          return (billable / 1_000_000) * usdPerMillion;
        }

        function estimateCost(input) {
          const visitors = Math.max(0, input.visitors);
          const averageWaitSeconds = Math.max(0, input.averageWaitSeconds);
          const pollIntervalSeconds = Math.max(0.5, input.pollIntervalSeconds);
          const heartbeatIntervalSeconds = Math.max(1, input.heartbeatIntervalSeconds);
          const avgCpuMsPerRequest = 3;

          const statusPollsPerVisitor =
            averageWaitSeconds <= 0 ? 0 : Math.ceil(averageWaitSeconds / pollIntervalSeconds);
          const heartbeatsPerVisitor =
            averageWaitSeconds <= 0 ? 0 : Math.ceil(averageWaitSeconds / heartbeatIntervalSeconds);

          const workerRequests = visitors * (2 + statusPollsPerVisitor + heartbeatsPerVisitor + 1);
          const durableObjectRequests = visitors * (1 + statusPollsPerVisitor + heartbeatsPerVisitor);
          const workerCpuMs = workerRequests * avgCpuMsPerRequest;
          const activeHours = Math.max(averageWaitSeconds / 3600, visitors > 0 ? averageWaitSeconds / 3600 : 0);
          const durableObjectDurationGbSeconds =
            Math.max(activeHours, visitors > 0 ? 1 / 3600 : 0) * 3600 * rates.durableObjectMemoryGb;

          const workerRequestUsd = overageCost(
            workerRequests,
            rates.workerRequestsIncluded,
            rates.workerRequestUsdPerMillion,
          );
          const workerCpuUsd = overageCost(
            workerCpuMs,
            rates.workerCpuMsIncluded,
            rates.workerCpuUsdPerMillionMs,
          );
          const durableObjectRequestUsd = overageCost(
            durableObjectRequests,
            rates.durableObjectRequestsIncluded,
            rates.durableObjectRequestUsdPerMillion,
          );
          const durableObjectDurationUsd = overageCost(
            durableObjectDurationGbSeconds,
            rates.durableObjectDurationGbSecondsIncluded,
            rates.durableObjectDurationUsdPerMillionGbSeconds,
          );
          const baseFeeUsd = rates.workersPaidBaseUsd;
          const totalUsd =
            workerRequestUsd +
            workerCpuUsd +
            durableObjectRequestUsd +
            durableObjectDurationUsd +
            baseFeeUsd;

          const pollingShare = statusPollsPerVisitor + heartbeatsPerVisitor;
          let dominantCost = "mixed";
          if (visitors === 0 || totalUsd <= baseFeeUsd + 0.01) dominantCost = "base_fee";
          else if (pollingShare >= 20) dominantCost = "polling";
          else if (pollingShare <= 2) dominantCost = "joins";

          return {
            statusPollsPerVisitor,
            heartbeatsPerVisitor,
            workerRequests,
            durableObjectRequests,
            workerRequestUsd,
            workerCpuUsd,
            durableObjectRequestUsd,
            durableObjectDurationUsd,
            baseFeeUsd,
            totalUsd,
            dominantCost,
          };
        }

        function formatUsd(value) {
          if (value < 0.01 && value > 0) return "<$0.01";
          return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: value >= 100 ? 0 : 2,
          }).format(value);
        }

        function formatCount(value) {
          return new Intl.NumberFormat("en-US", {
            notation: value >= 1_000_000 ? "compact" : "standard",
            maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
          }).format(value);
        }

        function formatRps(value) {
          return new Intl.NumberFormat("en-US", {
            maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
          }).format(value);
        }

        function capitalize(s) {
          return s.charAt(0).toUpperCase() + s.slice(1);
        }

        function defaultPeak(visitors) {
          const capped = Math.min(Math.max(0, visitors), thresholds.recommendedMaxConcurrentWaiting);
          return capped > 0 ? capped : thresholds.recommendedMaxConcurrentWaiting;
        }

        function readInputs() {
          const visitors = Math.max(0, Number(visitorsInput.value || 0));
          const peakConcurrentWaiting = Math.max(0, Number(peakInput.value || 0));
          const waitMinutes = Math.max(0, Number(waitInput.value || 0));
          const pollIntervalSeconds = Math.max(0.5, Number(pollInput.value || 15));
          const heartbeatIntervalSeconds = Math.max(1, Number(heartbeatInput.value || 30));
          const joinBurstDurationSeconds = Math.max(1, Number(burstInput.value || 60));
          const admissionRatePerSecond = Math.max(0, Number(admissionInput.value || 0));
          return {
            visitors,
            peakConcurrentWaiting,
            waitMinutes,
            pollIntervalSeconds,
            heartbeatIntervalSeconds,
            joinBurstDurationSeconds,
            admissionRatePerSecond,
          };
        }

        function render() {
          const input = readInputs();

          const result = estimateCost({
            visitors: input.visitors,
            averageWaitSeconds: input.waitMinutes * 60,
            pollIntervalSeconds: input.pollIntervalSeconds,
            heartbeatIntervalSeconds: input.heartbeatIntervalSeconds,
          });

          totalEl.textContent = formatUsd(result.totalUsd);
          rowsEl.innerHTML = [
            ["Status polls / visitor", formatCount(result.statusPollsPerVisitor)],
            ["Heartbeats / visitor", formatCount(result.heartbeatsPerVisitor)],
            ["Worker requests", formatCount(result.workerRequests)],
            ["Durable Object requests", formatCount(result.durableObjectRequests)],
            ["Worker requests ($)", formatUsd(result.workerRequestUsd)],
            ["Worker CPU ($)", formatUsd(result.workerCpuUsd)],
            ["Durable Object requests ($)", formatUsd(result.durableObjectRequestUsd)],
            ["Durable Object duration ($)", formatUsd(result.durableObjectDurationUsd)],
            ["Workers Paid base fee", formatUsd(result.baseFeeUsd)],
          ]
            .map(
              ([k, v]) =>
                '<div class="row"><span class="k">' + k + '</span><span>' + v + "</span></div>",
            )
            .join("");

          const messages = {
            polling:
              "Polling dominates this estimate. Raising the poll interval or shortening average wait cuts the bill fastest.",
            joins:
              "Joins and page views dominate — waiting is short, so polling stays cheap.",
            base_fee: "Mostly the Workers Paid base fee at this scale.",
            mixed: "Costs are spread across joins, polls, and platform base fee.",
          };
          calloutEl.dataset.tone = result.dominantCost;
          calloutEl.textContent = messages[result.dominantCost] || messages.mixed;

          const load = estimateQueueLoadClient({
            totalVisitors: input.visitors,
            peakConcurrentWaiting: input.peakConcurrentWaiting,
            statusPollIntervalSeconds: input.pollIntervalSeconds,
            heartbeatIntervalSeconds: input.heartbeatIntervalSeconds,
            joinBurstDurationSeconds: input.joinBurstDurationSeconds,
          });

          loadPeakEl.textContent = formatCount(load.peakConcurrentWaiting);
          loadStatusEl.textContent = formatRps(load.statusRps);
          loadHeartbeatEl.textContent = formatRps(load.heartbeatRps);
          loadJoinEl.textContent = formatRps(load.joinBurstRps);
          loadPeakRpsEl.textContent = formatRps(load.estimatedPeakRps);
          loadRiskEl.textContent = capitalize(load.riskLevel);
          loadRiskEl.dataset.tone = load.riskLevel;

          if (load.riskLevel === "low") {
            recommendationEl.hidden = true;
            recommendationEl.textContent = "";
          } else {
            recommendationEl.hidden = false;
            recommendationEl.dataset.tone = load.riskLevel;
            recommendationEl.textContent = load.recommendation;
          }
        }

        const presetValues = {
          short: {
            visitors: 5000000,
            wait: 2,
            poll: 15,
            heartbeat: 30,
            peak: 5000,
            burst: 30,
            admission: 2,
          },
          medium: {
            visitors: 5000000,
            wait: 15,
            poll: 15,
            heartbeat: 30,
            peak: 5000,
            burst: 60,
            admission: 2,
          },
          long: {
            visitors: 5000000,
            wait: 60,
            poll: 15,
            heartbeat: 30,
            peak: 5000,
            burst: 90,
            admission: 2,
          },
          small: {
            visitors: 100000,
            wait: 5,
            poll: 15,
            heartbeat: 30,
            peak: 2000,
            burst: 45,
            admission: 2,
          },
        };

        presets.forEach((btn) => {
          btn.addEventListener("click", () => {
            const preset = presetValues[btn.getAttribute("data-preset")];
            if (!preset) return;
            visitorsInput.value = String(preset.visitors);
            peakInput.value = String(preset.peak);
            waitInput.value = String(preset.wait);
            pollInput.value = String(preset.poll);
            heartbeatInput.value = String(preset.heartbeat);
            burstInput.value = String(preset.burst);
            admissionInput.value = String(preset.admission);
            presets.forEach((b) => b.setAttribute("aria-pressed", "false"));
            btn.setAttribute("aria-pressed", "true");
            render();
          });
        });

        [visitorsInput, peakInput, waitInput, pollInput, heartbeatInput, burstInput, admissionInput].forEach(
          (el) => {
            el.addEventListener("input", () => {
              presets.forEach((b) => b.setAttribute("aria-pressed", "false"));
              render();
            });
          },
        );

        visitorsInput.addEventListener("change", () => {
          const visitors = Math.max(0, Number(visitorsInput.value || 0));
          if (!peakInput.dataset.touched) {
            peakInput.value = String(defaultPeak(visitors));
          }
        });
        peakInput.addEventListener("input", () => {
          peakInput.dataset.touched = "1";
        });

        render();
      })();
    </script>
  </body>
</html>`;
}

function formatRps(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
  }).format(value);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Keep TypeScript aware that seed formatting helpers are used server-side. */
export function summarizeCost(estimate: CostEstimateBreakdown): string {
  return `${formatUsd(estimate.totalUsd)} for ${formatCount(estimate.visitors)} visitors`;
}
