import {
  DEFAULT_CLOUDFLARE_PAID_RATES,
  estimateWaitingRoomCost,
  formatCount,
  formatUsd,
  type CostEstimateBreakdown,
} from "../core/cost-estimate";

/**
 * Interactive ballpark cost calculator for operators.
 * Math lives in `src/core/cost-estimate.ts` — this page only presents it.
 */
export function renderCostCalculatorPage(): string {
  const seed = estimateWaitingRoomCost({
    visitors: 5_000_000,
    averageWaitSeconds: 15 * 60,
  });
  const ratesJson = JSON.stringify(DEFAULT_CLOUDFLARE_PAID_RATES);

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
        width: min(100% - 2rem, 52rem);
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
        max-width: 46ch;
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
      .fine {
        margin-top: 1.5rem;
        font-size: 0.85rem;
        color: var(--muted);
        line-height: 1.5;
      }
      code { font-size: 0.9em; color: var(--text); }
      .mode-fieldset {
        border: 1px solid var(--line);
        border-radius: 0.4rem;
        padding: 0.75rem 0.85rem 0.35rem;
        margin: 0 0 1rem;
      }
      .mode-fieldset legend {
        padding: 0 0.35rem;
        color: var(--muted);
        font-size: 0.85rem;
      }
      .mode-option {
        display: flex;
        gap: 0.55rem;
        align-items: flex-start;
        margin-bottom: 0.65rem;
        font-size: 0.9rem;
        line-height: 1.35;
      }
      .mode-option input { margin-top: 0.2rem; accent-color: var(--accent); }
      .mode-note, .warn-note {
        margin: 0 0 1rem;
        font-size: 0.88rem;
        color: var(--muted);
        line-height: 1.45;
      }
      .warn-note { color: var(--warn); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="top">
        <p class="brand">TideGuard</p>
        <a href="/">Home</a>
      </div>
      <h1>Calculate cost</h1>
      <p class="lede">
        Ballpark Cloudflare spend for a waiting-room event. TideGuard’s default
        <strong>adaptive</strong> polling slows check-ins when you’re far back and speeds up near your turn — that usually dominates cost far less than fixed frequent polls.
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
          <label>
            <span>Visitors</span>
            <input id="visitors" type="number" min="0" step="1000" value="5000000" />
          </label>
          <label>
            <span>Average wait (minutes)</span>
            <input id="waitMinutes" type="number" min="0" step="1" value="15" />
          </label>
          <fieldset class="mode-fieldset">
            <legend>Polling mode</legend>
            <label class="mode-option">
              <input type="radio" name="pollingMode" value="adaptive" checked />
              <span>Adaptive (default) — relative to place in line; status renews liveness</span>
            </label>
            <label class="mode-option">
              <input type="radio" name="pollingMode" value="fixed" />
              <span>Fixed intervals (advanced, not recommended)</span>
            </label>
          </fieldset>
          <p class="mode-note" id="adaptiveNote">
            Model uses ~42s average poll (5s near front → 60s far back) and no dedicated heartbeats.
          </p>
          <div id="fixedFields" hidden>
            <p class="warn-note">Fixed frequent polling usually costs more. Prefer adaptive unless you have a custom client.</p>
            <label>
              <span>Status poll interval (seconds)</span>
              <input id="pollSeconds" type="number" min="0.5" step="0.5" value="15" />
            </label>
            <label>
              <span>Heartbeat interval (seconds)</span>
              <input id="heartbeatSeconds" type="number" min="1" step="1" value="30" />
            </label>
          </div>
        </section>

        <section class="panel" aria-labelledby="result-title" aria-live="polite">
          <h2 id="result-title">Estimated total</h2>
          <p class="hero-cost" id="total">${formatUsd(seed.totalUsd)}</p>
          <p class="hero-note" id="summary">Including Workers Paid base fee. Usage beyond included monthly allotments.</p>
          <div class="rows" id="rows"></div>
          <p class="callout" id="callout" data-tone="${seed.dominantCost}"></p>
        </section>
      </div>

      <p class="fine">
        Model source: <code>src/core/cost-estimate.ts</code>.
        Also available as JSON at <a href="/api/cost-estimate?visitors=5000000&averageWaitSeconds=900"><code>/api/cost-estimate</code></a>.
        Rates are Workers Paid + Durable Objects list prices and may change. Excludes origin hosting and SQLite storage overages.
      </p>
    </div>

    <script id="cost-rates" type="application/json">${ratesJson}</script>
    <script>
      (() => {
        const rates = JSON.parse(document.getElementById("cost-rates").textContent);
        const visitorsInput = document.getElementById("visitors");
        const waitInput = document.getElementById("waitMinutes");
        const pollInput = document.getElementById("pollSeconds");
        const heartbeatInput = document.getElementById("heartbeatSeconds");
        const fixedFields = document.getElementById("fixedFields");
        const adaptiveNote = document.getElementById("adaptiveNote");
        const modeInputs = document.querySelectorAll('input[name="pollingMode"]');
        const totalEl = document.getElementById("total");
        const rowsEl = document.getElementById("rows");
        const calloutEl = document.getElementById("callout");
        const presets = document.querySelectorAll("[data-preset]");

        function overageCost(units, included, usdPerMillion) {
          const billable = Math.max(0, units - included);
          return (billable / 1_000_000) * usdPerMillion;
        }

        function adaptiveAveragePollSeconds() {
          return 5 + (60 - 5) * (2 / 3);
        }

        function selectedMode() {
          const checked = document.querySelector('input[name="pollingMode"]:checked');
          return checked && checked.value === "fixed" ? "fixed" : "adaptive";
        }

        function syncModeUi() {
          const fixed = selectedMode() === "fixed";
          fixedFields.hidden = !fixed;
          adaptiveNote.hidden = fixed;
        }

        function estimate(input) {
          const visitors = Math.max(0, input.visitors);
          const averageWaitSeconds = Math.max(0, input.averageWaitSeconds);
          const pollingMode = input.pollingMode === "fixed" ? "fixed" : "adaptive";
          const avgCpuMsPerRequest = 3;

          let pollIntervalSeconds;
          let heartbeatIntervalSeconds;
          let statusPollsPerVisitor;
          let heartbeatsPerVisitor;

          if (pollingMode === "adaptive") {
            pollIntervalSeconds = adaptiveAveragePollSeconds();
            heartbeatIntervalSeconds = 0;
            statusPollsPerVisitor =
              averageWaitSeconds <= 0 ? 0 : Math.ceil(averageWaitSeconds / pollIntervalSeconds);
            heartbeatsPerVisitor = 0;
          } else {
            pollIntervalSeconds = Math.max(0.5, input.pollIntervalSeconds);
            heartbeatIntervalSeconds = Math.max(1, input.heartbeatIntervalSeconds);
            statusPollsPerVisitor =
              averageWaitSeconds <= 0 ? 0 : Math.ceil(averageWaitSeconds / pollIntervalSeconds);
            heartbeatsPerVisitor =
              averageWaitSeconds <= 0 ? 0 : Math.ceil(averageWaitSeconds / heartbeatIntervalSeconds);
          }

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
            pollingMode,
            pollIntervalSeconds,
            heartbeatIntervalSeconds,
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

        function render() {
          syncModeUi();
          const mode = selectedMode();
          const result = estimate({
            visitors: Number(visitorsInput.value || 0),
            averageWaitSeconds: Number(waitInput.value || 0) * 60,
            pollingMode: mode,
            pollIntervalSeconds: Number(pollInput.value || 15),
            heartbeatIntervalSeconds: Number(heartbeatInput.value || 30),
          });

          totalEl.textContent = formatUsd(result.totalUsd);
          const pollLabel =
            result.pollingMode === "adaptive"
              ? "Avg status poll (adaptive)"
              : "Status poll interval";
          rowsEl.innerHTML = [
            ["Polling mode", result.pollingMode],
            [pollLabel, Number(result.pollIntervalSeconds).toFixed(1) + "s"],
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
              result.pollingMode === "fixed"
                ? "Fixed polling dominates this estimate. Switch to adaptive or raise intervals to cut the bill."
                : "Polling still dominates at this wait length. Shortening average wait cuts the bill fastest.",
            joins:
              "Joins and page views dominate — waiting is short, so polling stays cheap.",
            base_fee: "Mostly the Workers Paid base fee at this scale.",
            mixed: "Costs are spread across joins, polls, and platform base fee.",
          };
          calloutEl.dataset.tone = result.dominantCost;
          calloutEl.textContent = messages[result.dominantCost] || messages.mixed;
        }

        const presetValues = {
          short: { visitors: 5000000, wait: 2, poll: 15, heartbeat: 30 },
          medium: { visitors: 5000000, wait: 15, poll: 15, heartbeat: 30 },
          long: { visitors: 5000000, wait: 60, poll: 15, heartbeat: 30 },
          small: { visitors: 100000, wait: 5, poll: 15, heartbeat: 30 },
        };

        presets.forEach((btn) => {
          btn.addEventListener("click", () => {
            const preset = presetValues[btn.getAttribute("data-preset")];
            if (!preset) return;
            visitorsInput.value = String(preset.visitors);
            waitInput.value = String(preset.wait);
            pollInput.value = String(preset.poll);
            heartbeatInput.value = String(preset.heartbeat);
            presets.forEach((b) => b.setAttribute("aria-pressed", "false"));
            btn.setAttribute("aria-pressed", "true");
            render();
          });
        });

        [visitorsInput, waitInput, pollInput, heartbeatInput].forEach((el) => {
          el.addEventListener("input", render);
        });
        modeInputs.forEach((el) => el.addEventListener("change", render));

        render();
      })();
    </script>
  </body>
</html>`;
}

/** Keep TypeScript aware that seed formatting helpers are used server-side. */
export function summarizeCost(estimate: CostEstimateBreakdown): string {
  return `${formatUsd(estimate.totalUsd)} for ${formatCount(estimate.visitors)} visitors`;
}
