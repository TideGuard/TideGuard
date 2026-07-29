import type { WaitingRoomBranding } from "../core/branding";

export interface AdminAppOptions {
  setupComplete: boolean;
  defaultQueue: string;
  defaultBranding: WaitingRoomBranding;
}

/**
 * Single-page admin surface: setup wizard, login, or dashboard.
 * Live branding preview updates in-browser; KV writes only on Save / Finish setup.
 */
export function renderAdminApp(options: AdminAppOptions): string {
  const brandingJson = JSON.stringify(options.defaultBranding);
  const setupComplete = JSON.stringify(options.setupComplete);
  const defaultQueue = JSON.stringify(options.defaultQueue);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TideGuard Admin</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #07151c;
        --bg-2: #0b1f2a;
        --panel: #0e2531;
        --line: color-mix(in oklab, #e8f1f5 14%, transparent);
        --text: #e8f1f5;
        --muted: #8aa4b0;
        --accent: #2bb0a6;
        --accent-2: #3dd6c8;
        --danger: #e07070;
        --ok: #3dd6c8;
        --focus: #7ee0d6;
        --radius: 10px;
        --font: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body {
        font-family: var(--font);
        color: var(--text);
        background:
          radial-gradient(circle at top left, #16384a 0%, transparent 42%),
          linear-gradient(165deg, var(--bg), #0b1f2a 55%, #123041);
        line-height: 1.45;
      }
      a { color: var(--accent-2); }
      .shell {
        width: min(1120px, calc(100% - 2rem));
        margin: 0 auto;
        padding: 1.5rem 0 3rem;
      }
      .top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .brand {
        font-size: 0.8rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
        margin: 0;
      }
      h1 {
        margin: 0.2rem 0 0;
        font-size: 1.75rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        text-wrap: balance;
      }
      .muted { color: var(--muted); }
      .panel {
        background: color-mix(in oklab, var(--panel) 88%, transparent);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 1.25rem 1.35rem;
      }
      .steps {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 0 0 1.25rem;
        padding: 0;
        list-style: none;
      }
      .steps li {
        font-size: 0.8rem;
        color: var(--muted);
        padding: 0.35rem 0.7rem;
        border: 1px solid transparent;
        border-radius: 999px;
      }
      .steps li[aria-current="step"] {
        color: var(--text);
        border-color: var(--line);
        background: color-mix(in oklab, var(--accent) 16%, transparent);
      }
      .grid {
        display: grid;
        gap: 1.25rem;
      }
      @media (min-width: 900px) {
        .grid-2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      }
      label {
        display: grid;
        gap: 0.35rem;
        font-size: 0.85rem;
        color: var(--muted);
        margin-bottom: 0.85rem;
      }
      input[type="text"],
      input[type="password"],
      input[type="color"],
      textarea,
      select {
        width: 100%;
        font: inherit;
        color: var(--text);
        background: var(--bg-2);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 0.65rem 0.75rem;
      }
      input[type="color"] {
        padding: 0.25rem;
        height: 2.5rem;
      }
      textarea { min-height: 4.5rem; resize: vertical; }
      input:focus-visible,
      textarea:focus-visible,
      select:focus-visible,
      button:focus-visible {
        outline: 2px solid var(--focus);
        outline-offset: 2px;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        margin-top: 1rem;
      }
      button, .button {
        font: inherit;
        font-weight: 600;
        border-radius: 8px;
        border: 1px solid transparent;
        padding: 0.65rem 1rem;
        cursor: pointer;
        transition: background 160ms cubic-bezier(0.16, 1, 0.3, 1), border-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      button.primary {
        background: var(--accent);
        color: #042029;
      }
      button.primary:hover { background: var(--accent-2); }
      button.ghost {
        background: transparent;
        border-color: var(--line);
        color: var(--text);
      }
      button.ghost:hover {
        border-color: color-mix(in oklab, var(--accent) 50%, var(--line));
      }
      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .status {
        min-height: 1.35em;
        font-size: 0.9rem;
        margin: 0.75rem 0 0;
      }
      .status[data-tone="err"] { color: var(--danger); }
      .status[data-tone="ok"] { color: var(--ok); }
      .check {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        color: var(--text);
        margin: 0.5rem 0 1rem;
      }
      .check input { width: auto; }
      .mode {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
        margin-bottom: 1rem;
      }
      .mode button {
        text-align: left;
        background: var(--bg-2);
        border: 1px solid var(--line);
        color: var(--text);
      }
      .mode button[aria-pressed="true"] {
        border-color: var(--accent);
        background: color-mix(in oklab, var(--accent) 14%, var(--bg-2));
      }
      .mode strong { display: block; margin-bottom: 0.15rem; }
      .mode span { color: var(--muted); font-size: 0.85rem; font-weight: 400; }
      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
        gap: 0.75rem;
        margin-bottom: 1rem;
      }
      .metric {
        border-top: 1px solid var(--line);
        padding-top: 0.55rem;
      }
      .metric .label {
        display: block;
        font-size: 0.75rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .metric .value {
        font-size: 1.35rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .chart-card {
        border-top: 1px solid var(--line);
        padding-top: 0.75rem;
      }
      .chart-title {
        margin: 0 0 0.5rem;
        font-size: 0.85rem;
        color: var(--muted);
      }
      .chart-svg {
        width: 100%;
        min-height: 9rem;
        background: color-mix(in oklab, var(--bg) 55%, transparent);
        border-radius: 8px;
        overflow: hidden;
      }
      .chart-svg svg { display: block; width: 100%; height: 9rem; }
      .chart-legend {
        margin: 0.4rem 0 0;
        font-size: 0.8rem;
        color: var(--muted);
        display: flex;
        gap: 1rem;
        align-items: center;
      }
      .chart-legend .swatch {
        display: inline-block;
        width: 0.7rem;
        height: 0.7rem;
        border-radius: 2px;
        margin-right: 0.35rem;
        vertical-align: -0.05rem;
      }
      .chart-legend .swatch.waiting { background: var(--accent); }
      .chart-legend .swatch.admitted { background: color-mix(in oklab, var(--text) 55%, transparent); }
      .range-toggle {
        display: inline-flex;
        gap: 0.25rem;
        padding: 0.15rem;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: color-mix(in oklab, var(--bg) 70%, transparent);
      }
      .range-toggle button {
        appearance: none;
        border: 0;
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-size: 0.8rem;
        padding: 0.3rem 0.65rem;
        border-radius: 6px;
        cursor: pointer;
      }
      .range-toggle button[aria-pressed="true"] {
        background: color-mix(in oklab, var(--accent) 18%, transparent);
        color: var(--text);
        font-weight: 600;
      }
      .preview {
        border-radius: var(--radius);
        overflow: hidden;
        border: 1px solid var(--line);
        min-height: 280px;
        background: var(--pv-bg, #07151c);
        color: var(--pv-text, #e8f1f5);
        padding: 1.5rem 1.25rem;
        font-family: var(--pv-font, Georgia, serif);
      }
      .preview .p-brand {
        font-family: var(--font);
        font-size: 0.75rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--pv-muted, #8aa4b0);
        margin: 0 0 1rem;
      }
      .preview h2 {
        margin: 0 0 0.5rem;
        font-size: 1.55rem;
        font-weight: 650;
        text-wrap: balance;
      }
      .preview .p-msg {
        margin: 0 0 1.1rem;
        color: var(--pv-muted, #8aa4b0);
        font-family: var(--font);
        font-size: 0.95rem;
      }
      .preview .bar {
        height: 0.45rem;
        border-radius: 999px;
        background: color-mix(in oklab, var(--pv-text, #e8f1f5) 12%, transparent);
        overflow: hidden;
        margin-bottom: 1rem;
      }
      .preview .bar > span {
        display: block;
        height: 100%;
        width: 42%;
        background: linear-gradient(90deg, var(--pv-primary, #2bb0a6), var(--pv-accent, #3dd6c8));
      }
      .preview .stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem;
        font-family: var(--font);
      }
      .preview .stats[data-show-waiting="1"] {
        grid-template-columns: repeat(3, 1fr);
      }
      .preview .stat {
        border-top: 1px solid color-mix(in oklab, var(--pv-text, #e8f1f5) 14%, transparent);
        padding-top: 0.45rem;
      }
      .preview .stat .label {
        display: block;
        font-size: 0.7rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--pv-muted, #8aa4b0);
      }
      .preview .stat .value {
        font-family: var(--pv-font, Georgia, serif);
        font-size: 1.25rem;
        font-weight: 650;
      }
      .color-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
        gap: 0.65rem;
      }
      [hidden] { display: none !important; }
      @media (prefers-reduced-motion: reduce) {
        button { transition: none; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="top">
        <div>
          <p class="brand">TideGuard</p>
          <h1 id="page-title">Admin</h1>
        </div>
        <div class="row">
          <a href="/wait?queue=${escapeAttr(options.defaultQueue)}">Waiting room</a>
          <button type="button" class="ghost" id="logout-btn" hidden>Sign out</button>
        </div>
      </header>

      <section id="view-wizard" class="panel" hidden>
        <ol class="steps" aria-label="Setup steps">
          <li data-step="1" aria-current="step">1. Password</li>
          <li data-step="2">2. Queue</li>
          <li data-step="3">3. Branding</li>
        </ol>
        <div id="wizard-step-1">
          <p class="muted">Prove you own this Worker with <code>TOKEN_SECRET</code> (from Wrangler secrets), then create an admin password.</p>
          <label>TOKEN_SECRET
            <input id="setup-token-secret" type="password" autocomplete="off" spellcheck="false" />
          </label>
          <label>Password
            <input id="setup-password" type="password" autocomplete="new-password" minlength="8" />
          </label>
          <label>Confirm password
            <input id="setup-confirm" type="password" autocomplete="new-password" minlength="8" />
          </label>
        </div>
        <div id="wizard-step-2" hidden>
          <p class="muted">Choose how visitors are admitted and what the waiting room reveals.</p>
          <label>Queue name
            <input id="setup-queue" type="text" value="${escapeAttr(options.defaultQueue)}" />
          </label>
          <div class="mode" role="group" aria-label="Admission mode">
            <button type="button" id="mode-queue" aria-pressed="true"><strong>Queue Mode</strong><span>FIFO line</span></button>
            <button type="button" id="mode-lottery" aria-pressed="false"><strong>Lottery Mode</strong><span>Random among waiters</span></button>
          </div>
          <label class="check">
            <input id="setup-show-waiting" type="checkbox" />
            Show pool size / ahead &amp; behind on the waiting room
          </label>
          <label>Default redirect path
            <input id="setup-redirect" type="text" placeholder="/checkout or leave blank" />
          </label>
          <label class="check">
            <input id="setup-require-click" type="checkbox" />
            Require click to enter (no auto-redirect)
          </label>
          <label>Admit hold (seconds)
            <input id="setup-admit-hold" type="number" min="15" max="900" value="120" />
          </label>
          <p class="muted" style="font-size:0.85rem;margin:0">
            Redirect is a same-origin path. With click-to-enter, visitors must press Continue within the hold window or lose the spot.
          </p>
        </div>
        <div id="wizard-step-3" hidden>
          <div class="grid grid-2">
            <div>
              <label>Title
                <input id="b-title" type="text" />
              </label>
              <label>Message
                <textarea id="b-message"></textarea>
              </label>
              <div class="color-grid">
                <label>Primary <input id="b-primary" type="color" /></label>
                <label>Accent <input id="b-accent" type="color" /></label>
                <label>Background <input id="b-bg" type="color" /></label>
                <label>Surface <input id="b-surface" type="color" /></label>
                <label>Text <input id="b-text" type="color" /></label>
                <label>Muted <input id="b-muted" type="color" /></label>
              </div>
            </div>
            <div>
              <p class="muted" style="margin-top:0">Live preview (not saved yet)</p>
              <div class="preview" id="preview" aria-live="polite">
                <p class="p-brand">TideGuard</p>
                <h2 id="pv-title"></h2>
                <p class="p-msg" id="pv-message"></p>
                <div class="bar"><span></span></div>
                <div class="stats" id="pv-stats">
                  <div class="stat"><span class="label" id="pv-primary-label">Position</span><span class="value">3</span></div>
                  <div class="stat"><span class="label">Est. wait</span><span class="value">1m 30s</span></div>
                  <div class="stat" id="pv-waiting-stat" hidden><span class="label" id="pv-waiting-label">Ahead</span><span class="value">2</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="ghost" id="wizard-back" hidden>Back</button>
          <button type="button" class="primary" id="wizard-next">Continue</button>
        </div>
        <p class="status" id="wizard-status" data-tone="ok"></p>
      </section>

      <section id="view-login" class="panel" hidden>
        <p class="muted">Sign in with the password from setup.</p>
        <label>Password
          <input id="login-password" type="password" autocomplete="current-password" />
        </label>
        <div class="actions">
          <button type="button" class="primary" id="login-btn">Sign in</button>
        </div>
        <p class="status" id="login-status" data-tone="ok"></p>
      </section>

      <section id="view-dashboard" hidden>
        <div class="panel" id="ops-panel" style="margin-bottom:1.25rem">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap">
            <p class="muted" style="margin:0"><strong style="color:var(--text)">Live queue</strong> · auto-refresh 5s</p>
            <p class="muted" style="margin:0;font-size:0.85rem" id="ops-refreshed">Updated —</p>
          </div>
          <div class="metrics ops" id="ops-metrics" style="margin-top:0.85rem;margin-bottom:0.5rem">
            <div class="metric"><span class="label">Waiting</span><span class="value" id="ops-waiting">—</span></div>
            <div class="metric"><span class="label">Admitted</span><span class="value" id="ops-admitted">—</span></div>
            <div class="metric"><span class="label">In app</span><span class="value" id="ops-entered">—</span></div>
            <div class="metric"><span class="label">Holding</span><span class="value" id="ops-holding">—</span></div>
            <div class="metric"><span class="label">Open slots</span><span class="value" id="ops-open">—</span></div>
            <div class="metric"><span class="label">Capacity</span><span class="value" id="ops-capacity">—</span></div>
            <div class="metric"><span class="label">Avg wait</span><span class="value" id="ops-avg-wait">—</span></div>
            <div class="metric"><span class="label">Oldest wait</span><span class="value" id="ops-oldest-wait">—</span></div>
            <div class="metric"><span class="label">ETA (back)</span><span class="value" id="ops-eta">—</span></div>
            <div class="metric"><span class="label">Admit / s</span><span class="value" id="ops-rate">—</span></div>
            <div class="metric"><span class="label">Geo blocks</span><span class="value" id="ops-geo-hits">—</span></div>
          </div>
          <p class="muted" style="font-size:0.85rem;margin:0.5rem 0 0" id="ops-status-line">—</p>
          <p class="muted" style="font-size:0.85rem;margin:0.35rem 0 0" id="ops-geo-line" hidden>—</p>
        </div>
        <div class="panel" id="analytics-panel" style="margin-bottom:1.25rem">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
            <p class="muted" style="margin:0"><strong style="color:var(--text)">Analytics</strong> · 5-minute intervals</p>
            <div class="range-toggle" role="group" aria-label="Analytics time range">
              <button type="button" data-analytics-range="1" aria-pressed="false">1h</button>
              <button type="button" data-analytics-range="12" aria-pressed="true">12h</button>
              <button type="button" data-analytics-range="24" aria-pressed="false">24h</button>
            </div>
          </div>
          <div class="charts" style="display:grid;gap:1rem;margin-top:0.85rem">
            <div class="chart-card">
              <p class="chart-title">Queue depth over time</p>
              <div class="chart-svg" id="chart-queue" role="img" aria-label="Waiting and admitted over time"></div>
              <p class="chart-legend"><span class="swatch waiting"></span> Waiting <span class="swatch admitted"></span> Admitted</p>
            </div>
            <div class="chart-card">
              <p class="chart-title">Average wait (seconds)</p>
              <div class="chart-svg" id="chart-wait" role="img" aria-label="Average wait over time"></div>
            </div>
            <div class="chart-card">
              <p class="chart-title">Country block hits over time</p>
              <div class="chart-svg" id="chart-geo" role="img" aria-label="Geo block hits over time"></div>
            </div>
            <div class="chart-card">
              <p class="chart-title">Blocked countries (this window)</p>
              <div class="chart-svg" id="chart-geo-bars" role="img" aria-label="Hits by country"></div>
            </div>
          </div>
          <p class="muted" style="font-size:0.85rem;margin:0.75rem 0 0" id="analytics-empty">
            Charts build in this browser while the control room is open — one point every 5 minutes from live metrics. Keep this tab open to grow history.
          </p>
        </div>
        <div class="grid grid-2">
          <div class="panel">
            <div class="metrics" id="metrics">
              <div class="metric"><span class="label">Waiting</span><span class="value" id="m-waiting">—</span></div>
              <div class="metric"><span class="label">Admitted</span><span class="value" id="m-admitted">—</span></div>
              <div class="metric"><span class="label">Capacity</span><span class="value" id="m-capacity">—</span></div>
              <div class="metric"><span class="label">Mode</span><span class="value" id="m-mode">—</span></div>
            </div>
            <label>Queue
              <input id="dash-queue" type="text" />
            </label>
            <div class="mode" role="group" aria-label="Admission mode">
              <button type="button" id="dash-mode-queue" aria-pressed="true"><strong>Queue Mode</strong><span>FIFO</span></button>
              <button type="button" id="dash-mode-lottery" aria-pressed="false"><strong>Lottery Mode</strong><span>Random</span></button>
            </div>
            <label class="check">
              <input id="dash-show-waiting" type="checkbox" />
              Show depth on waiting room
            </label>
            <label>Default redirect path
              <input id="dash-redirect" type="text" placeholder="/ or /checkout" />
            </label>
            <label class="check">
              <input id="dash-require-click" type="checkbox" />
              Require click to enter
            </label>
            <label>Admit hold (seconds)
              <input id="dash-admit-hold" type="number" min="15" max="900" />
            </label>
            <label>Enter button label
              <input id="dash-enter-label" type="text" />
            </label>
            <label>Title
              <input id="dash-title" type="text" />
            </label>
            <label>Message
              <textarea id="dash-message"></textarea>
            </label>
            <div class="color-grid">
              <label>Primary <input id="dash-primary" type="color" /></label>
              <label>Accent <input id="dash-accent" type="color" /></label>
              <label>Background <input id="dash-bg" type="color" /></label>
              <label>Surface <input id="dash-surface" type="color" /></label>
              <label>Text <input id="dash-text" type="color" /></label>
              <label>Muted <input id="dash-muted" type="color" /></label>
            </div>
            <div class="actions">
              <button type="button" class="primary" id="save-branding">Save branding</button>
              <button type="button" class="ghost" id="save-mode">Apply mode</button>
            </div>
            <p class="status" id="dash-status" data-tone="ok"></p>
          </div>
          <div class="panel">
            <p class="muted" style="margin-top:0">Live preview</p>
            <div class="preview" id="dash-preview">
              <p class="p-brand">TideGuard</p>
              <h2 id="dash-pv-title"></h2>
              <p class="p-msg" id="dash-pv-message"></p>
              <div class="bar"><span></span></div>
              <div class="stats" id="dash-pv-stats">
                <div class="stat"><span class="label" id="dash-pv-primary-label">Position</span><span class="value">3</span></div>
                <div class="stat"><span class="label">Est. wait</span><span class="value">1m 30s</span></div>
                <div class="stat" id="dash-pv-waiting-stat" hidden><span class="label" id="dash-pv-waiting-label">Ahead</span><span class="value">2</span></div>
              </div>
            </div>
            <p class="muted" style="margin-top:1rem;font-size:0.9rem">
              Preview updates as you edit. KV is written only when you save.
            </p>
          </div>
        </div>
        <div class="panel" style="margin-top:1.25rem">
            <p class="muted" style="margin-top:0"><strong style="color:var(--text)">Traffic controls</strong></p>
            <p class="muted" style="font-size:0.85rem;margin:0 0 0.75rem">
              Opening time shows a countdown to visitors. Pause and health throttling are silent — the waiting room does not announce them.
              One browser profile = one seat (ticket cookie). Extra devices can still take extra seats.
            </p>
            <label>Opening time (local)
              <input id="traffic-opens-at" type="datetime-local" />
            </label>
            <div class="actions">
              <button type="button" class="primary" id="save-schedule">Save opening time</button>
              <button type="button" class="ghost" id="clear-schedule">Open now</button>
            </div>
            <label class="check">
              <input id="traffic-paused" type="checkbox" />
              Silent pause (stop admissions; visitors are not told)
            </label>
            <div class="actions">
              <button type="button" class="primary" id="save-pause">Apply pause</button>
            </div>
            <p class="status" id="traffic-status" data-tone="ok"></p>
            <hr style="border:0;border-top:1px solid color-mix(in oklab, var(--muted) 35%, transparent);margin:1rem 0" />
            <label class="check">
              <input id="health-enabled" type="checkbox" />
              Origin health throttle
            </label>
            <label>Health URL
              <input id="health-url" type="url" placeholder="https://origin.example.com/health" />
            </label>
            <div class="color-grid">
              <label>Interval (s) <input id="health-interval" type="number" min="15" max="300" /></label>
              <label>Max latency (ms) <input id="health-latency" type="number" min="100" /></label>
              <label>Expect status <input id="health-status" type="number" min="100" max="599" /></label>
              <label>Slow rate (0–1) <input id="health-slow" type="number" min="0.01" max="1" step="0.05" /></label>
              <label>Fail threshold <input id="health-fail" type="number" min="1" max="20" /></label>
              <label>Recover threshold <input id="health-recover" type="number" min="1" max="20" /></label>
            </div>
            <p class="muted" style="font-size:0.85rem" id="health-live">Health: —</p>
            <div class="actions">
              <button type="button" class="primary" id="save-health">Save health</button>
              <button type="button" class="ghost" id="health-override">Ignore 15m</button>
              <button type="button" class="ghost" id="health-clear-override">Clear override</button>
            </div>
            <p class="status" id="health-status-msg" data-tone="ok"></p>
        </div>
        <div class="panel" style="margin-top:1.25rem">
          <p class="muted" style="margin-top:0"><strong style="color:var(--text)">Origin proxy</strong> — Cloudflare in front of your real site or service</p>
          <label class="check">
            <input id="origin-enabled" type="checkbox" />
            Enable origin proxy
          </label>
          <label>Origin URL
            <input id="origin-url" type="url" placeholder="https://shop.example.com" />
          </label>
          <label class="check">
            <input id="origin-protect-all" type="checkbox" checked />
            Protect all non-TideGuard paths (recommended)
          </label>
          <label>Path prefixes (if not protecting all)
            <input id="origin-prefixes" type="text" placeholder="/checkout,/account" />
          </label>
          <p class="muted" style="font-size:0.85rem;margin:0 0 0.75rem">
            TideGuard keeps <code>/wait</code>, <code>/admin</code>, <code>/join</code>, and other control paths. Everything else can be gated and proxied to the origin. See docs/protecting-origin.md.
          </p>
          <div class="actions">
            <button type="button" class="primary" id="save-origin">Save origin proxy</button>
          </div>
          <p class="status" id="origin-status" data-tone="ok"></p>
        </div>
        <div class="panel" style="margin-top:1.25rem">
          <p class="muted" style="margin-top:0"><strong style="color:var(--text)">IP allowlist</strong> — office / staff skip the queue</p>
          <p class="muted" style="font-size:0.85rem;margin:0 0 0.75rem">
            Matching clients get a normal admission cookie and never join the Durable Object queue.
            TideGuard trusts only <code>CF-Connecting-IP</code> (set automatically when the hostname is
            <strong>proxied</strong> / orange-clouded). There is no separate “enable Connecting-IP” toggle.
            Use <strong>Pass queue</strong> to skip the line for this admin browser without changing the allowlist.
          </p>
          <p class="muted" style="font-size:0.85rem;margin:0 0 0.75rem" id="bypass-ip-live">Your IP: —</p>
          <label>Allowed IPs / CIDRs (one per line)
            <textarea id="bypass-allowlist" rows="4" placeholder="203.0.113.0/24&#10;2001:db8::/64"></textarea>
          </label>
          <div class="actions">
            <button type="button" class="primary" id="save-bypass">Save allowlist</button>
            <button type="button" class="ghost" id="pass-queue">Pass queue (this browser)</button>
          </div>
          <p class="muted" style="font-size:0.85rem;margin:0.5rem 0 0">
            <strong style="color:var(--text)">Pass queue</strong> issues an admission cookie for this browser and opens the protected app — no waiting room, no queue slot.
          </p>
          <p class="status" id="bypass-status" data-tone="ok"></p>
          <hr style="border:0;border-top:1px solid color-mix(in oklab, var(--muted) 35%, transparent);margin:1rem 0" />
          <p class="muted" style="margin:0 0 0.5rem"><strong style="color:var(--text)">Country block</strong> — temporary geo gate</p>
          <p class="muted" style="font-size:0.85rem;margin:0 0 0.75rem">
            Blocks visitors by <code>CF-IPCountry</code> (requires IP Geolocation on).
            IP allowlist and Pass queue still get through. Unknown codes (<code>XX</code>/<code>T1</code>) are not blocked unless listed.
            A TTL is required so the list expires automatically.
          </p>
          <p class="muted" style="font-size:0.85rem;margin:0 0 0.75rem" id="geo-live">Your country: —</p>
          <p class="muted" style="font-size:0.85rem;margin:0 0 0.75rem" id="geo-hits-live">Blocks this window: —</p>
          <label class="check">
            <input id="geo-enabled" type="checkbox" />
            Enable country block
          </label>
          <label>Blocked countries (ISO codes, one per line)
            <textarea id="geo-countries" rows="3" placeholder="CN&#10;RU&#10;KP"></textarea>
          </label>
          <label>TTL (hours, max 720 / 30 days)
            <input id="geo-ttl-hours" type="number" min="0.25" max="720" step="0.25" value="24" />
          </label>
          <div class="actions">
            <button type="button" class="primary" id="save-geo-block">Save country block</button>
            <button type="button" class="ghost" id="clear-geo-block">Disable now</button>
          </div>
          <p class="status" id="geo-status" data-tone="ok"></p>
          <hr style="border:0;border-top:1px solid color-mix(in oklab, var(--muted) 35%, transparent);margin:1rem 0" />
          <p class="muted" style="margin:0 0 0.5rem"><strong style="color:var(--text)">Cloudflare access</strong> — API token + Zone ID</p>
          <p class="muted" style="font-size:0.85rem;margin:0 0 0.75rem">
            Paste credentials so TideGuard can check DNS proxy (needed for <code>CF-Connecting-IP</code> allowlisting)
            and optionally enable <strong>IP Geolocation</strong> (<code>CF-IPCountry</code> — country code, not the visitor IP).
            Zone ID is the 32-character id on the zone Overview page (same id in API URLs like
            <code>/zones/&lt;zone_id&gt;/settings/…</code>).
          </p>
          <label>Zone ID
            <input id="cf-zone-id" type="text" placeholder="e.g. 8de9847589590c558962a6deb0e85a05" autocomplete="off" spellcheck="false" />
          </label>
          <label>API token <span class="muted" id="cf-token-state">(not saved)</span>
            <input id="cf-api-token" type="password" placeholder="Paste token, then Save — leave blank to keep existing" autocomplete="new-password" />
          </label>
          <p class="muted" style="font-size:0.85rem;margin:0 0 0.75rem">
            Create token:
            <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener">API Tokens</a>
            → Create Custom Token → permissions
            <code>Zone → DNS → Edit</code>,
            <code>Zone → Zone → Read</code>,
            <code>Zone → Zone Settings → Edit</code>,
            include <strong>only this zone</strong>. Stored encrypted; never shown again.
          </p>
          <label>Hostname to check
            <input id="cf-hostname" type="text" placeholder="www.example.com" autocomplete="off" />
          </label>
          <div class="actions">
            <button type="button" class="primary" id="save-cloudflare">Save Cloudflare access</button>
            <button type="button" class="ghost" id="check-cloudflare">Check setup</button>
            <button type="button" class="ghost" id="fix-cloudflare-proxy">Fix setup</button>
            <button type="button" class="ghost" id="clear-cloudflare-token">Clear token</button>
          </div>
          <p class="status" id="cloudflare-status" data-tone="ok"></p>
        </div>
      </section>
    </div>
    <script>
      (() => {
        const initialSetupComplete = ${setupComplete};
        const defaultQueue = ${defaultQueue};
        const defaults = ${brandingJson};

        const state = {
          step: 1,
          admissionMode: "queue",
          setupComplete: initialSetupComplete,
        };
        let metricsTimer = null;
        let analyticsRangeHours = 12;
        let lastGeoForCharts = null;
        const ANALYTICS_INTERVAL_MS = 5 * 60 * 1000;
        const ANALYTICS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

        const views = {
          wizard: document.getElementById("view-wizard"),
          login: document.getElementById("view-login"),
          dashboard: document.getElementById("view-dashboard"),
        };

        function setStatus(el, text, tone) {
          el.textContent = text || "";
          el.dataset.tone = tone || "ok";
        }

        function formatDuration(sec) {
          if (!Number.isFinite(sec) || sec < 0) return "—";
          const n = Math.round(sec);
          if (n < 60) return n + "s";
          const m = Math.floor(n / 60);
          const s = n % 60;
          if (m < 60) return m + "m " + s + "s";
          return Math.floor(m / 60) + "h " + (m % 60) + "m";
        }

        function paintMetrics(m, refreshedAt) {
          if (!m) return;
          document.getElementById("m-waiting").textContent = String(m.waiting);
          document.getElementById("m-admitted").textContent = String(m.admitted);
          document.getElementById("m-capacity").textContent = String(m.capacity);
          document.getElementById("m-mode").textContent = m.admissionMode || state.admissionMode;

          document.getElementById("ops-waiting").textContent = String(m.waiting);
          document.getElementById("ops-admitted").textContent = String(m.admitted);
          document.getElementById("ops-entered").textContent = String(m.entered ?? "—");
          document.getElementById("ops-holding").textContent = String(m.holding ?? "—");
          document.getElementById("ops-open").textContent = String(m.openSlots ?? "—");
          document.getElementById("ops-capacity").textContent = String(m.capacity);
          document.getElementById("ops-avg-wait").textContent = formatDuration(m.averageWaitSeconds);
          document.getElementById("ops-oldest-wait").textContent = formatDuration(m.oldestWaitSeconds);
          document.getElementById("ops-eta").textContent = formatDuration(m.estimatedWaitSeconds);
          document.getElementById("ops-rate").textContent =
            typeof m.effectiveAdmitPerSecond === "number"
              ? String(m.effectiveAdmitPerSecond)
              : "—";

          const bits = [];
          bits.push(m.admissionMode === "lottery" ? "Lottery" : "FIFO");
          if (m.paused) bits.push("paused");
          if (m.opensAt && m.opensAt > Date.now()) {
            bits.push("opens " + new Date(m.opensAt).toLocaleString());
          } else {
            bits.push("open");
          }
          const h = m.health || {};
          if (h.enabled) {
            bits.push("health " + (h.level || "ok") + (h.autoPaused ? " (auto-paused)" : ""));
          }
          document.getElementById("ops-status-line").textContent = bits.join(" · ");
          if (refreshedAt) {
            document.getElementById("ops-refreshed").textContent =
              "Updated " + new Date(refreshedAt).toLocaleTimeString();
          }
        }

        function paintGeoHits(geo) {
          const hitsEl = document.getElementById("ops-geo-hits");
          const lineEl = document.getElementById("ops-geo-line");
          if (!hitsEl || !lineEl) return;
          if (!geo || !geo.stats) {
            hitsEl.textContent = "—";
            lineEl.hidden = true;
            return;
          }
          hitsEl.textContent = String(geo.stats.totalHits || 0);
          if (!geo.active && !(geo.stats.totalHits > 0)) {
            lineEl.hidden = true;
            return;
          }
          const parts = [];
          if (geo.active) {
            parts.push("Blocking " + (geo.countries || []).join(", "));
          } else if (geo.enabled) {
            parts.push("Country block inactive/expired");
          }
          const top = (geo.stats.byCountry || []).slice(0, 6)
            .map((row) => row.country + " " + row.hits)
            .join(" · ");
          if (top) parts.push("Hits: " + top);
          if (geo.stats.lastHitAt) {
            parts.push(
              "Last " +
                (geo.stats.lastHitCountry || "") +
                " @ " +
                new Date(geo.stats.lastHitAt).toLocaleTimeString(),
            );
          }
          lineEl.textContent = parts.join(" · ");
          lineEl.hidden = parts.length === 0;
        }

        async function refreshMetrics() {
          const queue = document.getElementById("dash-queue").value || defaultQueue;
          const data = await api("/api/admin/metrics?queue=" + encodeURIComponent(queue));
          paintMetrics(data.metrics, data.refreshedAt);
          if (data.geoBlock) {
            paintGeoHits(data.geoBlock);
            paintGeoBlock(data.geoBlock);
          }
          recordAnalyticsPoint(queue, data.metrics, data.geoBlock);
          paintAnalytics(queue, data.geoBlock);
        }

        function analyticsStorageKey(queue) {
          return "tideguard.analytics.v1:" + (queue || defaultQueue);
        }

        function loadAnalyticsPoints(queue) {
          try {
            const raw = localStorage.getItem(analyticsStorageKey(queue));
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            const cutoff = Date.now() - ANALYTICS_MAX_AGE_MS;
            return parsed.filter((row) => row && typeof row.ts === "number" && row.ts >= cutoff);
          } catch {
            return [];
          }
        }

        function saveAnalyticsPoints(queue, points) {
          try {
            localStorage.setItem(analyticsStorageKey(queue), JSON.stringify(points));
          } catch {
            /* ignore quota / private mode */
          }
        }

        function recordAnalyticsPoint(queue, metrics, geo) {
          if (!metrics) return;
          const now = Date.now();
          const bucket = Math.floor(now / ANALYTICS_INTERVAL_MS) * ANALYTICS_INTERVAL_MS;
          const cutoff = now - ANALYTICS_MAX_AGE_MS;
          const points = loadAnalyticsPoints(queue).filter((row) => row.ts >= cutoff);
          const geoHits =
            geo && geo.stats && typeof geo.stats.totalHits === "number" ? geo.stats.totalHits : 0;
          const point = {
            ts: bucket,
            waiting: Number(metrics.waiting) || 0,
            admitted: Number(metrics.admitted) || 0,
            entered: Number(metrics.entered) || 0,
            holding: Number(metrics.holding) || 0,
            averageWaitSeconds: Number(metrics.averageWaitSeconds) || 0,
            oldestWaitSeconds: Number(metrics.oldestWaitSeconds) || 0,
            geoHits: geoHits,
          };
          const last = points[points.length - 1];
          if (last && last.ts === bucket) {
            points[points.length - 1] = point;
          } else {
            points.push(point);
          }
          saveAnalyticsPoints(queue, points);
        }

        function pointsInRange(points) {
          const since = Date.now() - analyticsRangeHours * 60 * 60 * 1000;
          return points.filter((row) => row.ts >= since);
        }

        function geoHitsSeries(points) {
          return points.map((row, i) => {
            const prev = i > 0 ? points[i - 1].geoHits : row.geoHits;
            let hits = row.geoHits - prev;
            if (i === 0) hits = 0;
            if (row.geoHits < prev) hits = row.geoHits;
            return { ts: row.ts, hits: Math.max(0, hits) };
          });
        }

        function paintAnalytics(queue, geo) {
          if (geo) lastGeoForCharts = geo;
          const chartGeo = geo || lastGeoForCharts;
          const all = loadAnalyticsPoints(queue || defaultQueue);
          const samples = pointsInRange(all);
          const geoTimeline = geoHitsSeries(samples);
          const geoCountries = (chartGeo && chartGeo.stats && chartGeo.stats.byCountry) || [];
          const empty = document.getElementById("analytics-empty");
          const hasData = samples.length > 0 || geoCountries.length > 0;
          if (empty) empty.hidden = hasData;

          renderLineChart("chart-queue", samples, [
            { key: "waiting", color: "var(--accent)" },
            { key: "admitted", color: "color-mix(in oklab, var(--text) 55%, transparent)" },
          ]);
          renderLineChart("chart-wait", samples, [
            { key: "averageWaitSeconds", color: "var(--accent)" },
          ]);
          renderLineChart("chart-geo", geoTimeline, [{ key: "hits", color: "#e07a7a" }]);
          renderBarChart("chart-geo-bars", geoCountries.slice(0, 10));
        }

        function setAnalyticsRange(hours) {
          analyticsRangeHours = hours;
          document.querySelectorAll("[data-analytics-range]").forEach((btn) => {
            btn.setAttribute("aria-pressed", String(Number(btn.getAttribute("data-analytics-range")) === hours));
          });
          const queueEl = document.getElementById("dash-queue");
          const queue = (queueEl && queueEl.value) || defaultQueue;
          paintAnalytics(queue, lastGeoForCharts);
        }

        document.querySelectorAll("[data-analytics-range]").forEach((btn) => {
          btn.addEventListener("click", () => {
            setAnalyticsRange(Number(btn.getAttribute("data-analytics-range")) || 12);
          });
        });

        function renderLineChart(containerId, rows, series) {
          const root = document.getElementById(containerId);
          if (!root) return;
          if (!rows || rows.length === 0) {
            root.innerHTML = '<p class="muted" style="margin:0;padding:1rem;font-size:0.85rem">No points in this range yet</p>';
            return;
          }
          const w = 640;
          const h = 144;
          const pad = { t: 12, r: 12, b: 24, l: 36 };
          const innerW = w - pad.l - pad.r;
          const innerH = h - pad.t - pad.b;
          const xs = rows.map((r) => r.ts);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          let maxY = 1;
          for (const s of series) {
            for (const r of rows) {
              const v = Number(r[s.key]) || 0;
              if (v > maxY) maxY = v;
            }
          }
          const xAt = (ts) => pad.l + ((ts - minX) / Math.max(1, maxX - minX)) * innerW;
          const yAt = (v) => pad.t + innerH - (v / maxY) * innerH;
          const paths = series.map((s) => {
            const d = rows.map((r, i) => {
              const x = xAt(r.ts);
              const y = yAt(Number(r[s.key]) || 0);
              return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
            }).join(" ");
            return '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />';
          }).join("");
          const grid = [0, 0.5, 1].map((f) => {
            const y = pad.t + innerH * (1 - f);
            const label = Math.round(maxY * f);
            return '<line x1="' + pad.l + '" y1="' + y + '" x2="' + (w - pad.r) + '" y2="' + y + '" stroke="color-mix(in oklab, var(--muted) 25%, transparent)" stroke-width="1" />'
              + '<text x="4" y="' + (y + 4) + '" fill="var(--muted)" font-size="10">' + label + '</text>';
          }).join("");
          const startLabel = new Date(minX).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const endLabel = new Date(maxX).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          root.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + grid + paths
            + '<text x="' + pad.l + '" y="' + (h - 6) + '" fill="var(--muted)" font-size="10">' + startLabel + '</text>'
            + '<text x="' + (w - pad.r) + '" y="' + (h - 6) + '" fill="var(--muted)" font-size="10" text-anchor="end">' + endLabel + '</text>'
            + '</svg>';
        }

        function renderBarChart(containerId, rows) {
          const root = document.getElementById(containerId);
          if (!root) return;
          if (!rows || rows.length === 0) {
            root.innerHTML = '<p class="muted" style="margin:0;padding:1rem;font-size:0.85rem">No geo blocks recorded yet</p>';
            return;
          }
          const w = 640;
          const h = 144;
          const pad = { t: 12, r: 12, b: 28, l: 36 };
          const innerW = w - pad.l - pad.r;
          const innerH = h - pad.t - pad.b;
          const maxY = Math.max(1, ...rows.map((r) => r.hits));
          const gap = 6;
          const barW = Math.max(8, (innerW - gap * (rows.length - 1)) / rows.length);
          const bars = rows.map((r, i) => {
            const x = pad.l + i * (barW + gap);
            const bh = (r.hits / maxY) * innerH;
            const y = pad.t + innerH - bh;
            return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1)
              + '" height="' + Math.max(1, bh).toFixed(1) + '" fill="#e07a7a" rx="2" />'
              + '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (h - 8) + '" fill="var(--muted)" font-size="10" text-anchor="middle">'
              + r.country + '</text>';
          }).join("");
          root.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + bars + '</svg>';
        }

        function startMetricsPoll() {
          stopMetricsPoll();
          metricsTimer = setInterval(() => {
            refreshMetrics().catch(() => {});
          }, 5000);
        }

        function stopMetricsPoll() {
          if (metricsTimer) {
            clearInterval(metricsTimer);
            metricsTimer = null;
          }
        }

        function showView(name) {
          views.wizard.hidden = name !== "wizard";
          views.login.hidden = name !== "login";
          views.dashboard.hidden = name !== "dashboard";
          document.getElementById("logout-btn").hidden = name !== "dashboard";
          document.getElementById("page-title").textContent =
            name === "wizard" ? "Setup" : name === "login" ? "Sign in" : "Control room";
          if (name !== "dashboard") stopMetricsPoll();
        }

        function wizardBranding() {
          return {
            title: document.getElementById("b-title").value,
            message: document.getElementById("b-message").value,
            primaryColor: document.getElementById("b-primary").value,
            accentColor: document.getElementById("b-accent").value,
            backgroundColor: document.getElementById("b-bg").value,
            surfaceColor: document.getElementById("b-surface").value,
            textColor: document.getElementById("b-text").value,
            mutedColor: document.getElementById("b-muted").value,
            fontFamily: defaults.fontFamily,
            showWaitingCount: document.getElementById("setup-show-waiting").checked,
            redirectUrl: document.getElementById("setup-redirect").value.trim(),
            requireClickToEnter: document.getElementById("setup-require-click").checked,
            admitHoldSeconds: Number(document.getElementById("setup-admit-hold").value) || 120,
            enterButtonLabel: "Continue",
          };
        }

        function dashBranding() {
          return {
            title: document.getElementById("dash-title").value,
            message: document.getElementById("dash-message").value,
            primaryColor: document.getElementById("dash-primary").value,
            accentColor: document.getElementById("dash-accent").value,
            backgroundColor: document.getElementById("dash-bg").value,
            surfaceColor: document.getElementById("dash-surface").value,
            textColor: document.getElementById("dash-text").value,
            mutedColor: document.getElementById("dash-muted").value,
            fontFamily: defaults.fontFamily,
            showWaitingCount: document.getElementById("dash-show-waiting").checked,
            redirectUrl: document.getElementById("dash-redirect").value.trim(),
            requireClickToEnter: document.getElementById("dash-require-click").checked,
            admitHoldSeconds: Number(document.getElementById("dash-admit-hold").value) || 120,
            enterButtonLabel: document.getElementById("dash-enter-label").value.trim() || "Continue",
          };
        }

        function fillBrandingInputs(prefix, branding) {
          const map = {
            title: "title",
            message: "message",
            primary: "primaryColor",
            accent: "accentColor",
            bg: "backgroundColor",
            surface: "surfaceColor",
            text: "textColor",
            muted: "mutedColor",
          };
          for (const [id, key] of Object.entries(map)) {
            const el = document.getElementById(prefix + id);
            if (el) el.value = branding[key];
          }
        }

        function paintPreview(rootId, branding, mode) {
          const root = document.getElementById(rootId);
          root.style.setProperty("--pv-bg", branding.backgroundColor);
          root.style.setProperty("--pv-text", branding.textColor);
          root.style.setProperty("--pv-muted", branding.mutedColor);
          root.style.setProperty("--pv-primary", branding.primaryColor);
          root.style.setProperty("--pv-accent", branding.accentColor);
          root.style.setProperty("--pv-font", branding.fontFamily);
          const title = root.querySelector("h2");
          const msg = root.querySelector(".p-msg");
          if (title) title.textContent = branding.title;
          if (msg) msg.textContent = branding.message;
          const stats = root.querySelector(".stats");
          const waitingStat = root.querySelector("[id$='waiting-stat']");
          const primaryLabel = root.querySelector("[id$='primary-label']");
          const waitingLabel = root.querySelector("[id$='waiting-label']");
          if (primaryLabel) primaryLabel.textContent = mode === "lottery" ? "Lottery odds" : "Position";
          if (branding.showWaitingCount) {
            if (waitingStat) waitingStat.hidden = false;
            if (stats) stats.dataset.showWaiting = "1";
            if (waitingLabel) waitingLabel.textContent = mode === "lottery" ? "In pool" : "Ahead";
          } else {
            if (waitingStat) waitingStat.hidden = true;
            if (stats) stats.dataset.showWaiting = "0";
          }
        }

        function setWizardStep(step) {
          state.step = step;
          document.getElementById("wizard-step-1").hidden = step !== 1;
          document.getElementById("wizard-step-2").hidden = step !== 2;
          document.getElementById("wizard-step-3").hidden = step !== 3;
          document.getElementById("wizard-back").hidden = step === 1;
          document.getElementById("wizard-next").textContent = step === 3 ? "Finish setup" : "Continue";
          document.querySelectorAll(".steps li").forEach((li) => {
            const n = Number(li.dataset.step);
            if (n === step) li.setAttribute("aria-current", "step");
            else li.removeAttribute("aria-current");
          });
          if (step === 3) paintPreview("preview", wizardBranding(), state.admissionMode);
        }

        function setModeButtons(queueBtn, lotteryBtn, mode) {
          queueBtn.setAttribute("aria-pressed", mode === "queue" ? "true" : "false");
          lotteryBtn.setAttribute("aria-pressed", mode === "lottery" ? "true" : "false");
        }

        async function api(path, options) {
          const res = await fetch(path, {
            credentials: "same-origin",
            headers: { "content-type": "application/json", ...(options && options.headers) },
            ...options,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err = new Error((data.error && data.error.message) || "Request failed");
            err.status = res.status;
            throw err;
          }
          return data;
        }

        async function loadDashboard() {
          const queue = document.getElementById("dash-queue").value || defaultQueue;
          const data = await api("/api/admin/state?queue=" + encodeURIComponent(queue));
          document.getElementById("dash-queue").value = data.queue;
          fillBrandingInputs("dash-", data.branding);
          document.getElementById("dash-show-waiting").checked = !!data.branding.showWaitingCount;
          document.getElementById("dash-redirect").value = data.branding.redirectUrl || "";
          document.getElementById("dash-require-click").checked = !!data.branding.requireClickToEnter;
          document.getElementById("dash-admit-hold").value = String(data.branding.admitHoldSeconds || 120);
          document.getElementById("dash-enter-label").value = data.branding.enterButtonLabel || "Continue";
          state.admissionMode = data.admissionMode;
          setModeButtons(
            document.getElementById("dash-mode-queue"),
            document.getElementById("dash-mode-lottery"),
            data.admissionMode,
          );
          paintMetrics(data.metrics, Date.now());
          if (data.geoBlock) {
            paintGeoHits(data.geoBlock);
            paintGeoBlock(data.geoBlock);
          }
          recordAnalyticsPoint(data.queue || defaultQueue, data.metrics, data.geoBlock);
          paintAnalytics(data.queue || defaultQueue, data.geoBlock);
          paintPreview("dash-preview", dashBranding(), state.admissionMode);
          if (data.origin) {
            document.getElementById("origin-enabled").checked = !!data.origin.enabled;
            document.getElementById("origin-url").value = data.origin.originUrl || "";
            document.getElementById("origin-protect-all").checked = data.origin.protectAll !== false;
            document.getElementById("origin-prefixes").value = (data.origin.pathPrefixes || []).join(",");
          }
          paintBypass(data.bypass);
          if (data.traffic) {
            const opens = data.traffic.opensAt;
            const opensInput = document.getElementById("traffic-opens-at");
            if (opens) {
              const d = new Date(opens);
              const pad = (n) => String(n).padStart(2, "0");
              opensInput.value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
            } else {
              opensInput.value = "";
            }
            document.getElementById("traffic-paused").checked = !!data.traffic.paused;
            const h = data.traffic.health || {};
            const hc = data.traffic.healthConfig || {};
            document.getElementById("health-enabled").checked = !!hc.enabled;
            document.getElementById("health-url").value = hc.url || "";
            document.getElementById("health-interval").value = String(hc.intervalSeconds || 30);
            document.getElementById("health-latency").value = String(hc.maxLatencyMs || 3000);
            document.getElementById("health-status").value = String(hc.expectStatus || 200);
            document.getElementById("health-slow").value = String(hc.slowRateMultiplier || 0.25);
            document.getElementById("health-fail").value = String(hc.failThreshold || 2);
            document.getElementById("health-recover").value = String(hc.recoverThreshold || 2);
            document.getElementById("health-live").textContent =
              "Health: " + (h.enabled ? (h.level || "ok") : "off") +
              (h.lastLatencyMs != null ? (" · " + h.lastLatencyMs + "ms") : "") +
              (h.autoPaused ? " · auto-paused" : "") +
              (h.overrideUntil && h.overrideUntil > Date.now() ? " · override active" : "") +
              (typeof data.traffic.effectiveAdmitPerSecond === "number"
                ? (" · effective rate " + data.traffic.effectiveAdmitPerSecond + "/s")
                : "");
          }
          showView("dashboard");
          startMetricsPoll();
        }

        function paintBypass(bypass) {
          if (!bypass) return;
          document.getElementById("bypass-allowlist").value = bypass.allowlistText || "";
          document.getElementById("cf-zone-id").value = bypass.zoneId || "";
          document.getElementById("cf-hostname").value = bypass.hostname || "";
          document.getElementById("cf-token-state").textContent = bypass.hasApiToken
            ? "(saved · encrypted)"
            : "(not saved)";
          const ipEl = document.getElementById("bypass-ip-live");
          if (!bypass.connectingIpPresent) {
            ipEl.textContent =
              "Your IP: not visible — this request has no CF-Connecting-IP. Hostname may be DNS-only (grey cloud) or not on Cloudflare.";
          } else if (bypass.clientIpMatched) {
            ipEl.textContent = "Your IP: " + bypass.clientIp + " · matches allowlist (you skip the queue)";
          } else {
            ipEl.textContent =
              "Your IP: " + bypass.clientIp +
              (bypass.allowlist && bypass.allowlist.length
                ? " · not on allowlist"
                : " · allowlist empty");
          }
        }

        function paintGeoBlock(geo) {
          if (!geo) return;
          document.getElementById("geo-enabled").checked = !!geo.enabled;
          document.getElementById("geo-countries").value = geo.countriesText || "";
          const live = document.getElementById("geo-live");
          const country = geo.clientCountry || "—";
          if (geo.enabled && !geo.active) {
            live.textContent =
              "Your country: " + country + " · list expired or empty (not blocking)";
          } else if (!geo.active) {
            live.textContent = "Your country: " + country + " · country block inactive";
          } else if (geo.clientBlocked) {
            live.textContent =
              "Your country: " + country + " · would be blocked (allowlist/pass still override)";
          } else {
            const until = geo.expiresAt
              ? " · active until " + new Date(geo.expiresAt).toLocaleString()
              : "";
            live.textContent = "Your country: " + country + " · not blocked" + until;
          }
          if (geo.active && geo.hoursRemaining != null) {
            document.getElementById("geo-ttl-hours").value = String(
              Math.max(0.25, Math.round(geo.hoursRemaining * 4) / 4),
            );
          }
          const hits = document.getElementById("geo-hits-live");
          if (hits) {
            const stats = geo.stats || {};
            const top = (stats.byCountry || [])
              .slice(0, 8)
              .map((row) => row.country + "×" + row.hits)
              .join(", ");
            hits.textContent =
              "Blocks this window: " +
              String(stats.totalHits || 0) +
              (top ? " (" + top + ")" : "") +
              (stats.lastHitAt
                ? " · last " +
                  (stats.lastHitCountry || "") +
                  " " +
                  new Date(stats.lastHitAt).toLocaleTimeString()
                : "");
          }
          paintGeoHits(geo);
        }

        async function boot() {
          fillBrandingInputs("b-", defaults);
          document.getElementById("setup-queue").value = defaultQueue;
          document.getElementById("dash-queue").value = defaultQueue;
          const boot = await api("/api/admin/bootstrap");
          state.setupComplete = boot.setupComplete;
          if (!boot.setupComplete) {
            showView("wizard");
            setWizardStep(1);
            return;
          }
          try {
            await loadDashboard();
          } catch (err) {
            if (err.status === 401) showView("login");
            else setStatus(document.getElementById("login-status"), err.message, "err");
          }
        }

        document.getElementById("mode-queue").addEventListener("click", () => {
          state.admissionMode = "queue";
          setModeButtons(document.getElementById("mode-queue"), document.getElementById("mode-lottery"), "queue");
        });
        document.getElementById("mode-lottery").addEventListener("click", () => {
          state.admissionMode = "lottery";
          setModeButtons(document.getElementById("mode-queue"), document.getElementById("mode-lottery"), "lottery");
        });
        document.getElementById("dash-mode-queue").addEventListener("click", () => {
          state.admissionMode = "queue";
          setModeButtons(document.getElementById("dash-mode-queue"), document.getElementById("dash-mode-lottery"), "queue");
          paintPreview("dash-preview", dashBranding(), "queue");
        });
        document.getElementById("dash-mode-lottery").addEventListener("click", () => {
          state.admissionMode = "lottery";
          setModeButtons(document.getElementById("dash-mode-queue"), document.getElementById("dash-mode-lottery"), "lottery");
          paintPreview("dash-preview", dashBranding(), "lottery");
        });

        document.getElementById("wizard-back").addEventListener("click", () => {
          setWizardStep(Math.max(1, state.step - 1));
        });

        document.getElementById("wizard-next").addEventListener("click", async () => {
          const status = document.getElementById("wizard-status");
          setStatus(status, "", "ok");
          if (state.step === 1) {
            const tokenSecret = document.getElementById("setup-token-secret").value.trim();
            const password = document.getElementById("setup-password").value;
            const confirm = document.getElementById("setup-confirm").value;
            if (tokenSecret.length < 16) {
              setStatus(status, "TOKEN_SECRET must be at least 16 characters.", "err");
              return;
            }
            if (password.length < 8) {
              setStatus(status, "Password must be at least 8 characters.", "err");
              return;
            }
            if (password !== confirm) {
              setStatus(status, "Passwords do not match.", "err");
              return;
            }
            setWizardStep(2);
            return;
          }
          if (state.step === 2) {
            setWizardStep(3);
            return;
          }
          try {
            document.getElementById("wizard-next").disabled = true;
            const tokenSecret = document.getElementById("setup-token-secret").value.trim();
            await api("/api/admin/setup", {
              method: "POST",
              headers: { authorization: "Bearer " + tokenSecret },
              body: JSON.stringify({
                password: document.getElementById("setup-password").value,
                confirmPassword: document.getElementById("setup-confirm").value,
                queue: document.getElementById("setup-queue").value,
                admissionMode: state.admissionMode,
                branding: wizardBranding(),
              }),
            });
            state.setupComplete = true;
            await loadDashboard();
            setStatus(document.getElementById("dash-status"), "Setup complete.", "ok");
          } catch (err) {
            setStatus(status, err.message, "err");
          } finally {
            document.getElementById("wizard-next").disabled = false;
          }
        });

        document.getElementById("login-btn").addEventListener("click", async () => {
          const status = document.getElementById("login-status");
          try {
            await api("/api/admin/login", {
              method: "POST",
              body: JSON.stringify({ password: document.getElementById("login-password").value }),
            });
            await loadDashboard();
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("logout-btn").addEventListener("click", async () => {
          stopMetricsPoll();
          await api("/api/admin/logout", { method: "POST", body: "{}" });
          showView("login");
        });

        document.getElementById("dash-queue").addEventListener("change", () => {
          refreshMetrics().catch(() => {});
          startMetricsPoll();
        });

        document.getElementById("save-branding").addEventListener("click", async () => {
          const status = document.getElementById("dash-status");
          try {
            await api("/api/admin/branding", {
              method: "PUT",
              body: JSON.stringify({
                queue: document.getElementById("dash-queue").value,
                branding: dashBranding(),
              }),
            });
            setStatus(status, "Branding saved.", "ok");
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("save-mode").addEventListener("click", async () => {
          const status = document.getElementById("dash-status");
          try {
            await api("/api/admin/mode", {
              method: "POST",
              body: JSON.stringify({
                queue: document.getElementById("dash-queue").value,
                mode: state.admissionMode,
              }),
            });
            document.getElementById("m-mode").textContent = state.admissionMode;
            setStatus(status, "Admission mode updated.", "ok");
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("save-origin").addEventListener("click", async () => {
          const status = document.getElementById("origin-status");
          try {
            const data = await api("/api/admin/origin", {
              method: "PUT",
              body: JSON.stringify({
                enabled: document.getElementById("origin-enabled").checked,
                originUrl: document.getElementById("origin-url").value,
                protectAll: document.getElementById("origin-protect-all").checked,
                pathPrefixes: document.getElementById("origin-prefixes").value,
                queue: document.getElementById("dash-queue").value,
              }),
            });
            if (data.origin) {
              document.getElementById("origin-enabled").checked = !!data.origin.enabled;
              document.getElementById("origin-url").value = data.origin.originUrl || "";
              document.getElementById("origin-protect-all").checked = data.origin.protectAll !== false;
              document.getElementById("origin-prefixes").value = (data.origin.pathPrefixes || []).join(",");
            }
            setStatus(status, "Origin proxy saved.", "ok");
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("save-bypass").addEventListener("click", async () => {
          const status = document.getElementById("bypass-status");
          try {
            const data = await api("/api/admin/bypass", {
              method: "PUT",
              body: JSON.stringify({
                allowlistText: document.getElementById("bypass-allowlist").value,
              }),
            });
            paintBypass(data.bypass);
            setStatus(status, "Allowlist saved.", "ok");
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("pass-queue").addEventListener("click", async () => {
          const status = document.getElementById("bypass-status");
          try {
            const data = await api("/api/admin/pass", {
              method: "POST",
              body: JSON.stringify({
                queue: document.getElementById("dash-queue").value || defaultQueue,
                returnTo: document.getElementById("dash-redirect").value.trim() || undefined,
              }),
            });
            setStatus(status, "Passing queue…", "ok");
            window.location.assign(data.redirectTo || "/");
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("save-geo-block").addEventListener("click", async () => {
          const status = document.getElementById("geo-status");
          try {
            const data = await api("/api/admin/geo-block", {
              method: "PUT",
              body: JSON.stringify({
                enabled: document.getElementById("geo-enabled").checked,
                countriesText: document.getElementById("geo-countries").value,
                ttlHours: Number(document.getElementById("geo-ttl-hours").value),
              }),
            });
            paintGeoBlock(data.geoBlock);
            setStatus(
              status,
              data.geoBlock && data.geoBlock.active
                ? "Country block active until " + new Date(data.geoBlock.expiresAt).toLocaleString()
                : "Country block saved (inactive).",
              "ok",
            );
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("clear-geo-block").addEventListener("click", async () => {
          const status = document.getElementById("geo-status");
          try {
            const data = await api("/api/admin/geo-block", {
              method: "PUT",
              body: JSON.stringify({
                enabled: false,
                countriesText: document.getElementById("geo-countries").value,
              }),
            });
            document.getElementById("geo-enabled").checked = false;
            paintGeoBlock(data.geoBlock);
            setStatus(status, "Country block disabled.", "ok");
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("save-cloudflare").addEventListener("click", async () => {
          const status = document.getElementById("cloudflare-status");
          try {
            const token = document.getElementById("cf-api-token").value.trim();
            const data = await api("/api/admin/cloudflare", {
              method: "PUT",
              body: JSON.stringify({
                zoneId: document.getElementById("cf-zone-id").value,
                hostname: document.getElementById("cf-hostname").value,
                ...(token ? { apiToken: token } : {}),
              }),
            });
            document.getElementById("cf-api-token").value = "";
            paintBypass(data.bypass);
            setStatus(status, "Cloudflare access saved.", "ok");
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("clear-cloudflare-token").addEventListener("click", async () => {
          const status = document.getElementById("cloudflare-status");
          try {
            const data = await api("/api/admin/cloudflare", {
              method: "PUT",
              body: JSON.stringify({
                zoneId: document.getElementById("cf-zone-id").value,
                hostname: document.getElementById("cf-hostname").value,
                clearApiToken: true,
              }),
            });
            paintBypass(data.bypass);
            setStatus(status, "API token cleared.", "ok");
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        async function runCloudflareAction(path, label) {
          const status = document.getElementById("cloudflare-status");
          try {
            const data = await api(path, {
              method: "POST",
              body: JSON.stringify({
                zoneId: document.getElementById("cf-zone-id").value,
                hostname: document.getElementById("cf-hostname").value,
              }),
            });
            const check = data.check || {};
            const geo =
              check.ipGeolocation == null
                ? ""
                : check.ipGeolocation.on
                  ? " · IP Geolocation on"
                  : " · IP Geolocation off";
            const extra = (check.suggestions || []).length
              ? " — " + check.suggestions[0]
              : "";
            setStatus(status, (check.summary || label) + geo + extra, data.ok ? "ok" : "err");
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        }

        document.getElementById("check-cloudflare").addEventListener("click", () => {
          runCloudflareAction("/api/admin/cloudflare/check", "Check complete");
        });
        document.getElementById("fix-cloudflare-proxy").addEventListener("click", () => {
          runCloudflareAction("/api/admin/cloudflare/fix-proxy", "Setup updated");
        });

        document.getElementById("save-schedule").addEventListener("click", async () => {
          const status = document.getElementById("traffic-status");
          try {
            const raw = document.getElementById("traffic-opens-at").value;
            await api("/api/admin/schedule", {
              method: "PUT",
              body: JSON.stringify({
                queue: document.getElementById("dash-queue").value,
                opensAt: raw ? new Date(raw).toISOString() : null,
              }),
            });
            setStatus(status, "Opening time saved.", "ok");
            await loadDashboard();
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });
        document.getElementById("clear-schedule").addEventListener("click", async () => {
          const status = document.getElementById("traffic-status");
          try {
            await api("/api/admin/schedule", {
              method: "PUT",
              body: JSON.stringify({
                queue: document.getElementById("dash-queue").value,
                opensAt: null,
              }),
            });
            document.getElementById("traffic-opens-at").value = "";
            setStatus(status, "Room is open now.", "ok");
            await loadDashboard();
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });
        document.getElementById("save-pause").addEventListener("click", async () => {
          const status = document.getElementById("traffic-status");
          try {
            await api("/api/admin/pause", {
              method: "POST",
              body: JSON.stringify({
                queue: document.getElementById("dash-queue").value,
                paused: document.getElementById("traffic-paused").checked,
              }),
            });
            setStatus(status, "Pause setting applied.", "ok");
            await loadDashboard();
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });
        document.getElementById("save-health").addEventListener("click", async () => {
          const status = document.getElementById("health-status-msg");
          try {
            await api("/api/admin/health", {
              method: "PUT",
              body: JSON.stringify({
                queue: document.getElementById("dash-queue").value,
                enabled: document.getElementById("health-enabled").checked,
                url: document.getElementById("health-url").value,
                intervalSeconds: Number(document.getElementById("health-interval").value) || 30,
                maxLatencyMs: Number(document.getElementById("health-latency").value) || 3000,
                expectStatus: Number(document.getElementById("health-status").value) || 200,
                slowRateMultiplier: Number(document.getElementById("health-slow").value) || 0.25,
                failThreshold: Number(document.getElementById("health-fail").value) || 2,
                recoverThreshold: Number(document.getElementById("health-recover").value) || 2,
              }),
            });
            setStatus(status, "Health settings saved.", "ok");
            await loadDashboard();
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });
        document.getElementById("health-override").addEventListener("click", async () => {
          const status = document.getElementById("health-status-msg");
          try {
            await api("/api/admin/health", {
              method: "PUT",
              body: JSON.stringify({
                queue: document.getElementById("dash-queue").value,
                overrideMinutes: 15,
              }),
            });
            setStatus(status, "Health ignored for 15 minutes.", "ok");
            await loadDashboard();
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });
        document.getElementById("health-clear-override").addEventListener("click", async () => {
          const status = document.getElementById("health-status-msg");
          try {
            await api("/api/admin/health", {
              method: "PUT",
              body: JSON.stringify({
                queue: document.getElementById("dash-queue").value,
                clearOverride: true,
              }),
            });
            setStatus(status, "Health override cleared.", "ok");
            await loadDashboard();
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        ["b-title","b-message","b-primary","b-accent","b-bg","b-surface","b-text","b-muted","setup-show-waiting"].forEach((id) => {
          document.getElementById(id).addEventListener("input", () => {
            paintPreview("preview", wizardBranding(), state.admissionMode);
          });
        });
        ["dash-title","dash-message","dash-primary","dash-accent","dash-bg","dash-surface","dash-text","dash-muted","dash-show-waiting"].forEach((id) => {
          document.getElementById(id).addEventListener("input", () => {
            paintPreview("dash-preview", dashBranding(), state.admissionMode);
          });
        });

        boot().catch((err) => {
          showView(initialSetupComplete ? "login" : "wizard");
          setStatus(document.getElementById("login-status"), err.message || "Could not load admin", "err");
        });
      })();
    </script>
  </body>
</html>`;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
