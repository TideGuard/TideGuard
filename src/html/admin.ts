import type { WaitingRoomBranding } from "../core/branding";

export interface AdminAppOptions {
  setupComplete: boolean;
  defaultQueue: string;
  defaultBranding: WaitingRoomBranding;
  version: string;
}

/**
 * Single-page admin surface: setup wizard, login, or dashboard.
 * Live branding preview updates in-browser; KV writes only on Save / Finish setup.
 */
export function renderAdminApp(options: AdminAppOptions): string {
  const brandingJson = JSON.stringify(options.defaultBranding);
  const setupComplete = JSON.stringify(options.setupComplete);
  const defaultQueue = JSON.stringify(options.defaultQueue);
  const versionJson = JSON.stringify(options.version);
  const versionLabel = escapeAttr(options.version);

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
        display: flex;
        flex-direction: column;
        min-height: 100dvh;
        font-family: var(--font);
        color: var(--text);
        background:
          radial-gradient(circle at top left, #16384a 0%, transparent 42%),
          linear-gradient(165deg, var(--bg), #0b1f2a 55%, #123041);
        line-height: 1.45;
      }
      a { color: var(--accent-2); }
      .shell {
        flex: 1;
        width: min(1120px, calc(100% - 2rem));
        margin: 0 auto;
        padding: 1.5rem 0 3rem;
      }
      .site-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem 1.1rem;
        align-items: center;
        padding: 0.85rem 1rem 1.15rem;
        margin-top: auto;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 0.8rem;
      }
      .site-footer a { color: var(--muted); text-decoration: underline; text-underline-offset: 2px; }
      .site-footer a:hover { color: var(--accent-2); }
      .warn { color: #e0b070; }
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
        margin: 0 0 1rem;
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
      .steps li[data-done="1"] {
        color: var(--text);
        border-color: color-mix(in oklab, var(--ok) 40%, var(--line));
      }
      .steps li[aria-current="step"] {
        color: var(--text);
        border-color: var(--line);
        background: color-mix(in oklab, var(--accent) 16%, transparent);
      }
      .wizard-intro {
        margin: 0 0 1rem;
        font-size: 0.9rem;
        color: var(--muted);
      }
      .wizard-step-title {
        margin: 0 0 0.35rem;
        font-size: 1.15rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--text);
      }
      .wizard-step-why {
        margin: 0 0 1rem;
        font-size: 0.85rem;
        color: var(--muted);
      }
      .wizard-guide {
        margin: 0 0 1rem;
        padding: 0.75rem 0.9rem;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: color-mix(in oklab, var(--bg-2) 70%, transparent);
        font-size: 0.85rem;
        color: var(--muted);
      }
      .wizard-guide strong { color: var(--text); font-weight: 600; }
      .wizard-guide ol, .wizard-guide ul {
        margin: 0.45rem 0 0;
        padding-left: 1.2rem;
      }
      .wizard-guide li { margin: 0.25rem 0; }
      .pw-checklist {
        list-style: none;
        margin: -0.35rem 0 1rem;
        padding: 0;
        font-size: 0.82rem;
        color: var(--muted);
      }
      .pw-checklist li {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        margin: 0.28rem 0;
      }
      .pw-checklist li::before {
        content: "";
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 50%;
        background: var(--line);
        flex-shrink: 0;
      }
      .pw-checklist li[data-met="1"] {
        color: var(--ok);
      }
      .pw-checklist li[data-met="1"]::before {
        background: var(--ok);
      }
      .cf-subs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin: 0 0 1rem;
        padding: 0;
        list-style: none;
      }
      .cf-subs li {
        font-size: 0.75rem;
        color: var(--muted);
        padding: 0.28rem 0.6rem;
        border: 1px solid transparent;
        border-radius: 999px;
      }
      .cf-subs li[data-done="1"] {
        color: var(--text);
        border-color: color-mix(in oklab, var(--ok) 40%, var(--line));
      }
      .cf-subs li[aria-current="step"] {
        color: var(--text);
        border-color: var(--line);
        background: color-mix(in oklab, var(--accent) 16%, transparent);
      }
      .verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        margin: 0.65rem 0 0;
        padding: 0.35rem 0.65rem;
        border-radius: 8px;
        border: 1px solid color-mix(in oklab, var(--ok) 45%, var(--line));
        color: var(--ok);
        font-size: 0.85rem;
        font-weight: 600;
      }
      .verified-badge[data-tone="skip"] {
        color: var(--muted);
        border-color: var(--line);
        font-weight: 500;
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
        white-space: pre-line;
      }
      .status[data-tone="err"] { color: var(--danger); }
      .status[data-tone="ok"] { color: var(--ok); }
      .wizard-hints {
        margin: 0.45rem 0 0;
        padding-left: 1.15rem;
        color: var(--muted);
        font-size: 0.85rem;
        line-height: 1.45;
      }
      .wizard-hints[hidden] { display: none; }
      .wizard-hints li { margin: 0.2rem 0; }
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
      .list {
        display: grid;
        gap: 0.5rem;
      }
      .list-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.55rem 0.7rem;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: color-mix(in oklab, var(--bg-2) 70%, transparent);
        font-size: 0.9rem;
      }
      .list-row .meta {
        color: var(--muted);
        font-size: 0.8rem;
      }
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: color-mix(in oklab, #01090c 72%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        z-index: 50;
      }
      .modal-card {
        width: min(420px, 100%);
        max-width: 100%;
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
          <p class="brand">TideGuard <span class="muted" style="font-weight:500;letter-spacing:0;text-transform:none;font-size:0.8rem">v${versionLabel}</span></p>
          <h1 id="page-title">Admin</h1>
        </div>
        <div class="row">
          <a href="/wait?queue=${escapeAttr(options.defaultQueue)}">Waiting room</a>
          <button type="button" class="ghost" id="logout-btn" hidden>Sign out</button>
        </div>
      </header>

      <section id="view-wizard" class="panel" hidden>
        <p class="wizard-intro">
          Five steps to claim this Worker: prove ownership, connect Cloudflare, lock down admin login with Turnstile, then configure how visitors wait and what they see.
        </p>
        <ol class="steps" aria-label="Setup steps">
          <li data-step="1" aria-current="step">1. Account</li>
          <li data-step="2">2. Cloudflare</li>
          <li data-step="3">3. Turnstile</li>
          <li data-step="4">4. Queue</li>
          <li data-step="5">5. Branding</li>
        </ol>
        <div id="wizard-step-1">
          <h2 class="wizard-step-title">Claim the Worker</h2>
          <p class="wizard-step-why">Only someone with the Wrangler <code>TOKEN_SECRET</code> can finish setup. That stops a stranger from owning a public <code>*.workers.dev</code> URL.</p>
          <div class="wizard-guide">
            <strong>What you’ll do</strong>
            <ol>
              <li>Paste the same <code>TOKEN_SECRET</code> you set with Wrangler / Deploy to Cloudflare.</li>
              <li>Choose the first admin username and a strong password (checklist below).</li>
            </ol>
          </div>
          <label>TOKEN_SECRET
            <input id="setup-token-secret" type="password" autocomplete="off" spellcheck="false" />
          </label>
          <label>Username
            <input id="setup-username" type="text" autocomplete="username" placeholder="admin" />
          </label>
          <label>Password
            <input id="setup-password" type="password" autocomplete="new-password" minlength="8" />
          </label>
          <label>Confirm password
            <input id="setup-confirm" type="password" autocomplete="new-password" minlength="8" />
          </label>
          <ul class="pw-checklist" id="setup-pw-checklist" aria-label="Password requirements">
            <li data-rule="length">At least 8 characters</li>
            <li data-rule="upper">One uppercase letter</li>
            <li data-rule="digitOrSymbol">One digit or symbol</li>
            <li data-rule="match">Both passwords match</li>
          </ul>
        </div>
        <div id="wizard-step-2" hidden>
          <h2 class="wizard-step-title">Connect Cloudflare</h2>
          <p class="wizard-step-why">Verify proxied DNS with a scoped API token, then optionally set SSL and attach a custom domain. Fix runs only when verify finds gaps.</p>
          <ol class="cf-subs" aria-label="Cloudflare sub-steps">
            <li data-cf-sub="1" aria-current="step">2a. Connect</li>
            <li data-cf-sub="2">2b. SSL</li>
            <li data-cf-sub="3">2c. Domain</li>
          </ol>
          <div id="setup-cf-sub-1">
            <div class="wizard-guide">
              <strong>Create a token</strong>
              <ol>
                <li>Open <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener">API Tokens</a> → Create Custom Token.</li>
                <li>Permissions: <code>Zone → DNS → Edit</code>, <code>Zone → Zone → Read</code>, <code>Zone → Zone Settings → Edit</code>, <code>Account → Turnstile → Edit</code>, <code>Account → Workers Scripts → Write</code>.</li>
                <li>Zone Resources → Include → only this zone. Copy the token once.</li>
                <li>Paste token, Zone ID (zone Overview), and hostname → <strong>Click to verify</strong>. Use <strong>Fix setup</strong> only if verify reports DNS/proxy gaps.</li>
              </ol>
            </div>
            <label>API token
              <input id="setup-cf-token" type="password" autocomplete="off" spellcheck="false" />
            </label>
            <label>Zone ID
              <input id="setup-cf-zone" type="text" placeholder="32-character id from zone Overview" autocomplete="off" spellcheck="false" />
            </label>
            <label>Hostname
              <input id="setup-cf-hostname" type="text" placeholder="www.example.com" autocomplete="off" />
            </label>
            <label>Worker service name
              <input id="setup-cf-worker" type="text" value="tideguard" autocomplete="off" spellcheck="false" />
            </label>
            <div class="actions">
              <button type="button" class="primary" id="setup-cf-verify">Click to verify</button>
              <button type="button" class="ghost" id="setup-cf-fix" hidden>Fix setup</button>
            </div>
            <p class="verified-badge" id="setup-cf-verified" hidden>Verified — proxied DNS OK</p>
            <p class="status" id="setup-cf-status" data-tone="ok"></p>
            <ul class="wizard-hints" id="setup-cf-hints" hidden></ul>
          </div>
          <div id="setup-cf-sub-2" hidden>
            <div class="wizard-guide">
              <strong>SSL Full (strict)</strong>
              <p style="margin:0.45rem 0 0">Optional. Full (strict) requires a valid certificate on your origin. Wrong mode can cause Error 526 for visitors. Skip if you are not ready.</p>
            </div>
            <div class="actions">
              <button type="button" class="primary" id="setup-cf-ssl">Set Full (strict)</button>
              <button type="button" class="ghost" id="setup-cf-ssl-skip">Skip for now</button>
            </div>
            <p class="verified-badge" id="setup-cf-ssl-badge" hidden>Verified — SSL Full (strict)</p>
          </div>
          <div id="setup-cf-sub-3" hidden>
            <div class="wizard-guide">
              <strong>Custom domain</strong>
              <p style="margin:0.45rem 0 0">Optional until go-live. Attach this hostname to the TideGuard Worker, or skip and use workers.dev / routes for now.</p>
            </div>
            <div class="actions">
              <button type="button" class="primary" id="setup-cf-domain">Attach custom domain</button>
              <button type="button" class="ghost" id="setup-cf-domain-skip">Skip for now</button>
            </div>
            <p class="verified-badge" id="setup-cf-domain-badge" hidden>Verified — custom domain attached</p>
            <p class="status" id="setup-cf-domain-status" data-tone="ok"></p>
          </div>
        </div>
        <div id="wizard-step-3" hidden>
          <h2 class="wizard-step-title">Protect admin login</h2>
          <p class="wizard-step-why">Turnstile is Cloudflare’s bot challenge. Rate limits alone are soft; after this step, login and invite accept require a verified challenge.</p>
          <div class="wizard-guide">
            <strong>What you’ll do</strong>
            <ol>
              <li><strong>Create Turnstile widget</strong> — TideGuard calls the Cloudflare API with the token from the previous step (includes <code>localhost</code> for local dev).</li>
              <li>Complete the challenge in the widget below.</li>
              <li><strong>Click to verify</strong> so the server confirms siteverify before you continue.</li>
            </ol>
          </div>
          <div class="actions">
            <button type="button" class="primary" id="setup-ts-provision">Create Turnstile widget</button>
          </div>
          <div id="setup-ts-widget" style="margin:0.85rem 0"></div>
          <div class="actions">
            <button type="button" class="ghost" id="setup-ts-verify">Click to verify</button>
          </div>
          <p class="status" id="setup-ts-status" data-tone="ok"></p>
          <ul class="wizard-hints" id="setup-ts-hints" hidden></ul>
        </div>
        <div id="wizard-step-4" hidden>
          <h2 class="wizard-step-title">Configure the line</h2>
          <p class="wizard-step-why">This is how visitors are admitted once the waiting room is live — FIFO queue or lottery, what they see while waiting, and where they go after.</p>
          <div class="wizard-guide">
            <strong>Defaults that matter</strong>
            <ul>
              <li><strong>Queue Mode</strong> — fair FIFO. <strong>Lottery Mode</strong> — equal odds among waiters.</li>
              <li><strong>Show depth</strong> — pool size / ahead &amp; behind on <code>/wait</code> (optional).</li>
              <li><strong>Click to enter</strong> — visitors must press Continue within the hold window or lose the spot.</li>
            </ul>
          </div>
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
          <label class="check">
            <input id="setup-play-turn-sound" type="checkbox" />
            Play turn notification sound (Continue mode)
          </label>
          <label>Admit hold (seconds)
            <input id="setup-admit-hold" type="number" min="15" max="900" value="120" />
          </label>
          <p class="muted" style="font-size:0.85rem;margin:0">
            Redirect is a same-origin path. You can change all of this later in the control room.
          </p>
        </div>
        <div id="wizard-step-5" hidden>
          <h2 class="wizard-step-title">Brand the waiting room</h2>
          <p class="wizard-step-why">Copy and colors visitors see on <code>/wait</code>. Preview updates live; nothing is saved until you finish setup.</p>
          <div class="wizard-guide">
            <strong>Tips</strong>
            <ul>
              <li>Keep the title short; put detail in the message.</li>
              <li>Choose colors with enough contrast for muted text on the background.</li>
              <li>You can refine branding anytime from the control room after setup.</li>
            </ul>
          </div>
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
        <p class="muted">Sign in with your admin username and password.</p>
        <label>Username
          <input id="login-username" type="text" autocomplete="username" placeholder="admin" />
        </label>
        <label>Password
          <input id="login-password" type="password" autocomplete="current-password" />
        </label>
        <div id="login-turnstile" style="margin:0.75rem 0"></div>
        <div class="actions">
          <button type="button" class="primary" id="login-btn">Sign in</button>
        </div>
        <p class="status" id="login-status" data-tone="ok"></p>
      </section>

      <section id="view-invite" class="panel" hidden>
        <p class="muted">You’ve been invited to help manage this TideGuard Worker. Choose a username and password to finish joining.</p>
        <label>Username
          <input id="invite-username" type="text" autocomplete="username" placeholder="e.g. alex" />
        </label>
        <label>Password
          <input id="invite-password" type="password" autocomplete="new-password" minlength="8" />
        </label>
        <label>Confirm password
          <input id="invite-confirm" type="password" autocomplete="new-password" minlength="8" />
        </label>
        <ul class="pw-checklist" id="invite-pw-checklist" aria-label="Password requirements">
          <li data-rule="length">At least 8 characters</li>
          <li data-rule="upper">One uppercase letter</li>
          <li data-rule="digitOrSymbol">One digit or symbol</li>
          <li data-rule="match">Both passwords match</li>
        </ul>
        <div id="invite-turnstile" style="margin:0.75rem 0"></div>
        <div class="actions">
          <button type="button" class="primary" id="invite-accept-btn">Join team</button>
        </div>
        <p class="status" id="invite-status" data-tone="ok"></p>
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
            <label class="check">
              <input id="dash-play-turn-sound" type="checkbox" />
              Play turn notification sound
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
          <label>Worker service name
            <input id="cf-worker-service" type="text" value="tideguard" autocomplete="off" spellcheck="false" />
          </label>
          <label class="check">
            <input id="cf-ip-geo" type="checkbox" />
            IP Geolocation (<code>CF-IPCountry</code>) enabled on this zone
          </label>
          <p class="muted" style="font-size:0.85rem;margin:0.35rem 0" id="cf-ssl-status">SSL/TLS: —</p>
          <div class="actions" style="margin-top:0.35rem">
            <button type="button" class="ghost" id="cf-ssl-strict">Set Full (strict)</button>
          </div>
          <p class="muted" style="margin:0.85rem 0 0.35rem"><strong style="color:var(--text)">Custom domains</strong></p>
          <div id="cf-domains-list" class="list"></div>
          <label>Hostname
            <input id="cf-domain-hostname" type="text" placeholder="www.example.com" autocomplete="off" />
          </label>
          <div class="actions">
            <button type="button" class="ghost" id="cf-domain-add">Add</button>
            <button type="button" class="ghost" id="cf-domains-refresh">Refresh</button>
          </div>
          <p class="muted" style="font-size:0.85rem;margin:0.75rem 0 0" id="cf-turnstile-status">Turnstile: —</p>
          <p class="status" id="cloudflare-status" data-tone="ok"></p>
        </div>

        <div class="panel" style="margin-top:1.25rem">
          <p class="muted" style="margin-top:0"><strong style="color:var(--text)">Updates</strong> · GitHub releases</p>
          <p class="muted" style="font-size:0.9rem;margin:0 0 0.75rem" id="update-summary">
            Running <strong style="color:var(--text)">v${versionLabel}</strong>. Check against
            <a href="https://github.com/TideGuard/TideGuard/releases" target="_blank" rel="noopener">GitHub Releases</a>
            when you want to know if a newer build is out.
          </p>
          <p class="muted" style="font-size:0.85rem;margin:0 0 0.85rem" id="update-detail" aria-live="polite">—</p>
          <div class="actions" style="margin-top:0">
            <button type="button" class="primary" id="check-updates">Check for updates</button>
            <a class="ghost" id="update-release-link" href="https://github.com/TideGuard/TideGuard/releases" target="_blank" rel="noopener" hidden style="display:inline-flex;align-items:center;text-decoration:none;padding:0.55rem 0.9rem;border-radius:8px;border:1px solid var(--line);color:var(--text)">Release notes</a>
            <a class="ghost" href="https://github.com/TideGuard/TideGuard/blob/main/docs/upgrading.md" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none;padding:0.55rem 0.9rem;border-radius:8px;border:1px solid var(--line);color:var(--text)">Upgrade guide</a>
          </div>
          <p class="status" id="update-status" data-tone="ok"></p>
        </div>

        <div class="panel" style="margin-top:1.25rem" id="team-panel">
          <p class="muted" style="margin-top:0">
            <strong style="color:var(--text)">Team</strong> · signed in as
            <strong style="color:var(--text)" id="team-me">—</strong>
          </p>
          <p class="muted" style="font-size:0.85rem;margin:0 0 0.75rem">
            Invite teammates to help manage this Worker. Invite links expire after 72 hours and can only be used once.
          </p>
          <div id="team-users" class="list" style="margin-bottom:0.85rem"></div>
          <div class="actions">
            <button type="button" class="primary" id="create-invite">Create invite</button>
          </div>
          <div id="team-new-invite" hidden style="margin-top:0.85rem">
            <label>Invite link (copy now — shown only once)
              <input id="team-invite-url" type="text" readonly />
            </label>
            <div class="actions">
              <button type="button" class="ghost" id="copy-invite-url">Copy link</button>
            </div>
          </div>
          <p class="muted" style="font-size:0.85rem;margin:0.85rem 0 0.35rem" id="team-invites-label" hidden>Pending invites</p>
          <div id="team-invites" class="list"></div>
          <p class="status" id="team-status" data-tone="ok"></p>
        </div>

        <div class="panel" style="margin-top:1.25rem" id="activity-panel">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap">
            <p class="muted" style="margin:0"><strong style="color:var(--text)">Activity</strong> · recent admin actions</p>
            <button type="button" class="ghost" id="refresh-activity">Refresh</button>
          </div>
          <div id="activity-list" class="list" style="margin-top:0.85rem"></div>
          <p class="status" id="activity-status" data-tone="ok"></p>
        </div>
      </section>

      <div class="modal-overlay" id="confirm-overlay" hidden>
        <div class="panel modal-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
          <h2 id="confirm-title" style="margin-top:0"></h2>
          <p class="muted" id="confirm-body"></p>
          <div class="actions" style="justify-content:flex-end">
            <button type="button" class="ghost" id="confirm-cancel">Cancel</button>
            <button type="button" class="primary" id="confirm-ok">Confirm</button>
          </div>
        </div>
      </div>
    </div><!-- shell -->
    <footer class="site-footer">
      <span>TideGuard</span>
      <span>v${versionLabel}</span>
      <span>© 2026</span>
      <a href="https://github.com/TideGuard/TideGuard/blob/main/LICENSE" target="_blank" rel="noopener">MIT</a>
      <a href="https://github.com/TideGuard/TideGuard" target="_blank" rel="noopener">GitHub</a>
      <a href="https://github.com/TideGuard/TideGuard/tree/main/docs" target="_blank" rel="noopener">Docs</a>
      <a href="/wait">Waiting room</a>
    </footer>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
    <script>
      (() => {
        const initialSetupComplete = ${setupComplete};
        const defaultQueue = ${defaultQueue};
        const defaults = ${brandingJson};
        const appVersion = ${versionJson};

        const state = {
          step: 1,
          cfSubStep: 1,
          cfSslDone: false,
          cfSslSkipped: false,
          cfDomainDone: false,
          cfDomainSkipped: false,
          admissionMode: "queue",
          setupComplete: initialSetupComplete,
          updatesChecked: false,
          cloudflareReady: false,
          turnstileReady: false,
          turnstileSitekey: null,
          turnstileWidgetIds: { login: null, invite: null, setup: null },
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
          invite: document.getElementById("view-invite"),
        };

        function setStatus(el, text, tone) {
          el.textContent = text || "";
          el.dataset.tone = tone || "ok";
        }

        function setWizardHints(el, hints) {
          if (!el) return;
          const list = Array.isArray(hints) ? hints.filter(Boolean) : [];
          if (list.length === 0) {
            el.innerHTML = "";
            el.hidden = true;
            return;
          }
          el.innerHTML = list.map((h) => "<li>" + escapeHtml(String(h)) + "</li>").join("");
          el.hidden = false;
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
          views.invite.hidden = name !== "invite";
          document.getElementById("logout-btn").hidden = name !== "dashboard";
          document.getElementById("page-title").textContent =
            name === "wizard" ? "Setup" :
            name === "login" ? "Sign in" :
            name === "invite" ? "Join team" :
            "Control room";
          if (name !== "dashboard") stopMetricsPoll();
        }

        function usernameError(username) {
          if (username.length < 2 || username.length > 32) {
            return "Username must be 2–32 characters.";
          }
          if (!/^[a-z0-9][a-z0-9._-]*$/i.test(username)) {
            return "Username may use letters, numbers, dots, underscores, and hyphens.";
          }
          return null;
        }

        function confirmAction(title, body) {
          return new Promise((resolve) => {
            const overlay = document.getElementById("confirm-overlay");
            const titleEl = document.getElementById("confirm-title");
            const bodyEl = document.getElementById("confirm-body");
            const okBtn = document.getElementById("confirm-ok");
            const cancelBtn = document.getElementById("confirm-cancel");
            const previouslyFocused = document.activeElement;

            titleEl.textContent = title;
            bodyEl.textContent = body;
            overlay.hidden = false;

            function cleanup(result) {
              overlay.hidden = true;
              okBtn.removeEventListener("click", onOk);
              cancelBtn.removeEventListener("click", onCancel);
              overlay.removeEventListener("keydown", onKeydown);
              if (previouslyFocused && typeof previouslyFocused.focus === "function") {
                previouslyFocused.focus();
              }
              resolve(result);
            }
            function onOk() {
              cleanup(true);
            }
            function onCancel() {
              cleanup(false);
            }
            function onKeydown(event) {
              if (event.key === "Escape") {
                event.preventDefault();
                cleanup(false);
                return;
              }
              if (event.key === "Tab") {
                event.preventDefault();
                if (document.activeElement === okBtn) cancelBtn.focus();
                else okBtn.focus();
              }
            }
            okBtn.addEventListener("click", onOk);
            cancelBtn.addEventListener("click", onCancel);
            overlay.addEventListener("keydown", onKeydown);
            okBtn.focus();
          });
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
            playTurnSound: document.getElementById("setup-play-turn-sound").checked,
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
            playTurnSound: document.getElementById("dash-play-turn-sound").checked,
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
          document.getElementById("wizard-step-4").hidden = step !== 4;
          document.getElementById("wizard-step-5").hidden = step !== 5;
          document.getElementById("wizard-back").hidden = step === 1;
          const nextBtn = document.getElementById("wizard-next");
          nextBtn.textContent = step === 5 ? "Finish setup" : "Continue";
          if (step === 1) {
            nextBtn.disabled = !accountStepReady();
            syncPasswordChecklist("setup");
          } else if (step === 2) {
            paintCfSubSteps();
            nextBtn.disabled = !cfSubStepContinueEnabled();
          } else if (step === 3) {
            nextBtn.disabled = !state.turnstileReady;
          } else {
            nextBtn.disabled = false;
          }
          document.querySelectorAll(".steps li").forEach((li) => {
            const n = Number(li.dataset.step);
            if (n === step) {
              li.setAttribute("aria-current", "step");
              li.removeAttribute("data-done");
            } else {
              li.removeAttribute("aria-current");
              if (n < step) li.setAttribute("data-done", "1");
              else li.removeAttribute("data-done");
            }
          });
          if (step === 5) paintPreview("preview", wizardBranding(), state.admissionMode);
          if (step === 3 && state.turnstileSitekey) {
            renderTurnstile("setup-ts-widget", state.turnstileSitekey, "setup");
          }
        }

        function paintCfSubSteps() {
          const sub = state.cfSubStep;
          document.getElementById("setup-cf-sub-1").hidden = sub !== 1;
          document.getElementById("setup-cf-sub-2").hidden = sub !== 2;
          document.getElementById("setup-cf-sub-3").hidden = sub !== 3;
          document.getElementById("wizard-back").hidden = false;
          document.querySelectorAll(".cf-subs li").forEach((li) => {
            const n = Number(li.dataset.cfSub);
            if (n === sub) {
              li.setAttribute("aria-current", "step");
              li.removeAttribute("data-done");
            } else {
              li.removeAttribute("aria-current");
              if (n < sub || (n === 1 && state.cloudflareReady) || (n === 2 && state.cfSslDone) || (n === 3 && state.cfDomainDone)) {
                if (n < sub) li.setAttribute("data-done", "1");
                else li.removeAttribute("data-done");
              } else {
                li.removeAttribute("data-done");
              }
              if (n < sub) li.setAttribute("data-done", "1");
            }
          });
          const verified = document.getElementById("setup-cf-verified");
          verified.hidden = !state.cloudflareReady;
          const sslBadge = document.getElementById("setup-cf-ssl-badge");
          if (state.cfSslDone) {
            sslBadge.hidden = false;
            sslBadge.dataset.tone = state.cfSslSkipped ? "skip" : "ok";
            sslBadge.textContent = state.cfSslSkipped
              ? "Skipped — SSL unchanged"
              : "Verified — SSL Full (strict)";
          } else {
            sslBadge.hidden = true;
          }
          const domainBadge = document.getElementById("setup-cf-domain-badge");
          if (state.cfDomainDone) {
            domainBadge.hidden = false;
            domainBadge.dataset.tone = state.cfDomainSkipped ? "skip" : "ok";
            domainBadge.textContent = state.cfDomainSkipped
              ? "Skipped — custom domain optional"
              : "Verified — custom domain attached";
          } else {
            domainBadge.hidden = true;
          }
        }

        function cfSubStepContinueEnabled() {
          if (state.cfSubStep === 1) return !!state.cloudflareReady;
          if (state.cfSubStep === 2) return !!state.cfSslDone;
          if (state.cfSubStep === 3) return !!state.cfDomainDone;
          return false;
        }

        function evaluatePassword(password, confirm) {
          return {
            length: password.length >= 8 && password.length <= 128,
            upper: /[A-Z]/.test(password),
            digitOrSymbol: /[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password),
            match: password.length > 0 && password === confirm,
          };
        }

        function syncPasswordChecklist(kind) {
          const passwordEl = document.getElementById(kind + "-password");
          const confirmEl = document.getElementById(kind + "-confirm");
          const list = document.getElementById(kind + "-pw-checklist");
          if (!passwordEl || !confirmEl || !list) return false;
          const checks = evaluatePassword(passwordEl.value, confirmEl.value);
          list.querySelectorAll("[data-rule]").forEach((li) => {
            const rule = li.getAttribute("data-rule");
            li.dataset.met = checks[rule] ? "1" : "0";
          });
          return !!(checks.length && checks.upper && checks.digitOrSymbol && checks.match);
        }

        function accountStepReady() {
          const tokenSecret = document.getElementById("setup-token-secret").value.trim();
          const username = document.getElementById("setup-username").value.trim();
          if (tokenSecret.length < 16) return false;
          if (usernameError(username)) return false;
          return syncPasswordChecklist("setup");
        }

        function wirePasswordChecklist(kind, onChange) {
          const passwordEl = document.getElementById(kind + "-password");
          const confirmEl = document.getElementById(kind + "-confirm");
          const handler = () => {
            syncPasswordChecklist(kind);
            if (onChange) onChange();
          };
          passwordEl.addEventListener("input", handler);
          confirmEl.addEventListener("input", handler);
          if (kind === "setup") {
            document.getElementById("setup-token-secret").addEventListener("input", onChange);
            document.getElementById("setup-username").addEventListener("input", onChange);
          }
        }

        function setupBearerHeaders() {
          const tokenSecret = document.getElementById("setup-token-secret").value.trim();
          return { authorization: "Bearer " + tokenSecret };
        }

        function waitForTurnstile(timeoutMs) {
          return new Promise((resolve, reject) => {
            if (window.turnstile && typeof window.turnstile.render === "function") {
              resolve(window.turnstile);
              return;
            }
            const started = Date.now();
            const timer = setInterval(() => {
              if (window.turnstile && typeof window.turnstile.render === "function") {
                clearInterval(timer);
                resolve(window.turnstile);
              } else if (Date.now() - started > (timeoutMs || 10000)) {
                clearInterval(timer);
                reject(new Error("Turnstile script did not load"));
              }
            }, 50);
          });
        }

        function renderTurnstile(containerId, sitekey, slot) {
          if (!sitekey) return;
          const el = document.getElementById(containerId);
          if (!el) return;
          waitForTurnstile().then((ts) => {
            if (state.turnstileWidgetIds[slot] != null) {
              try { ts.remove(state.turnstileWidgetIds[slot]); } catch (_) {}
              state.turnstileWidgetIds[slot] = null;
            }
            el.innerHTML = "";
            state.turnstileWidgetIds[slot] = ts.render(el, {
              sitekey: sitekey,
              theme: "dark",
            });
          }).catch(() => {});
        }

        function getTurnstileToken(slot) {
          const id = state.turnstileWidgetIds[slot];
          if (id == null || !window.turnstile) return "";
          try {
            return window.turnstile.getResponse(id) || "";
          } catch (_) {
            return "";
          }
        }

        function resetTurnstile(slot) {
          const id = state.turnstileWidgetIds[slot];
          if (id == null || !window.turnstile) return;
          try { window.turnstile.reset(id); } catch (_) {}
        }

        function paintSetupCloudflareUi(verify, pending) {
          const status = document.getElementById("setup-cf-status");
          const hintsEl = document.getElementById("setup-cf-hints");
          const proxyOk = pending
            ? !!pending.proxyOk
            : !!(verify && verify.proxy && verify.proxy.ok);
          const sslStrict = pending
            ? !!pending.sslIsStrict
            : !!(verify && verify.ssl && verify.ssl.isStrict);
          const domainOk = pending
            ? !!pending.hostnameAttached
            : !!(verify && verify.domains && verify.domains.hostnameAttached);
          const summary =
            (verify && verify.proxy && verify.proxy.summary) ||
            (proxyOk ? "Cloudflare access verified." : "Cloudflare needs attention.");
          const bits = [summary];
          if (verify && verify.ssl) {
            bits.push("SSL " + (verify.ssl.mode || "unknown") + (verify.ssl.isStrict ? " (strict)" : ""));
          } else if (pending && pending.sslMode) {
            bits.push("SSL " + pending.sslMode + (pending.sslIsStrict ? " (strict)" : ""));
          }
          if (domainOk) {
            bits.push("custom domain attached");
          } else if (proxyOk) {
            bits.push("custom domain optional");
          }
          setStatus(status, bits.join(" · "), proxyOk ? "ok" : "err");
          const suggestions =
            (verify && verify.proxy && verify.proxy.suggestions) ||
            (verify && verify.check && verify.check.suggestions) ||
            [];
          setWizardHints(hintsEl, suggestions);
          document.getElementById("setup-cf-fix").hidden = proxyOk;
          if (pending) {
            state.cloudflareReady = !!pending.cloudflareReady;
            if (pending.turnstileReady != null) state.turnstileReady = !!pending.turnstileReady;
            if (pending.turnstileSitekey) state.turnstileSitekey = pending.turnstileSitekey;
            if (pending.sslIsStrict) {
              state.cfSslDone = true;
              state.cfSslSkipped = false;
            }
            if (pending.hostnameAttached) {
              state.cfDomainDone = true;
              state.cfDomainSkipped = false;
            }
          } else {
            state.cloudflareReady = proxyOk;
          }
          if (sslStrict && !state.cfSslDone) {
            state.cfSslDone = true;
            state.cfSslSkipped = false;
          }
          if (domainOk && !state.cfDomainDone) {
            state.cfDomainDone = true;
            state.cfDomainSkipped = false;
          }
          document.getElementById("setup-cf-verified").hidden = !state.cloudflareReady;
          if (state.step === 2) {
            paintCfSubSteps();
            document.getElementById("wizard-next").disabled = !cfSubStepContinueEnabled();
          }
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
          document.getElementById("dash-play-turn-sound").checked = !!data.branding.playTurnSound;
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
          paintTurnstileStatus(data.turnstile);
          if (data.turnstile && data.turnstile.sitekey) {
            state.turnstileSitekey = data.turnstile.sitekey;
          }
          refreshCfDomains().catch(() => {});
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
          paintTeam(data.team, data.me);
          showView("dashboard");
          startMetricsPoll();
          loadActivity().catch(() => {});
          if (!state.updatesChecked) {
            state.updatesChecked = true;
            refreshUpdates(false).catch(() => {});
          }
        }

        function paintBypass(bypass) {
          if (!bypass) return;
          document.getElementById("bypass-allowlist").value = bypass.allowlistText || "";
          document.getElementById("cf-zone-id").value = bypass.zoneId || "";
          document.getElementById("cf-hostname").value = bypass.hostname || "";
          document.getElementById("cf-worker-service").value = bypass.workerService || "tideguard";
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

        function paintTurnstileStatus(turnstile) {
          const el = document.getElementById("cf-turnstile-status");
          if (!el) return;
          if (turnstile && turnstile.configured) {
            el.textContent =
              "Turnstile: configured" +
              (turnstile.sitekey ? " · sitekey " + turnstile.sitekey.slice(0, 8) + "…" : "");
          } else {
            el.textContent = "Turnstile: not configured";
          }
        }

        function paintCloudflareCheck(check) {
          if (!check) return;
          const geoEl = document.getElementById("cf-ip-geo");
          if (geoEl && check.ipGeolocation != null) {
            geoEl.checked = !!check.ipGeolocation.on;
          }
          const sslEl = document.getElementById("cf-ssl-status");
          if (sslEl && check.ssl) {
            sslEl.textContent =
              "SSL/TLS: " +
              (check.ssl.mode || "unknown") +
              (check.ssl.isStrict ? " (Full strict)" : "");
            if (!check.ssl.isStrict) sslEl.classList.add("warn");
            else sslEl.classList.remove("warn");
          }
        }

        async function refreshCfDomains() {
          const root = document.getElementById("cf-domains-list");
          const status = document.getElementById("cloudflare-status");
          try {
            const data = await api("/api/admin/cloudflare/domains");
            const domains = data.domains || [];
            root.innerHTML =
              domains
                .map((d) => {
                  return (
                    '<div class="list-row"><span>' +
                    escapeHtml(d.hostname || d.id) +
                    ' <span class="meta">' +
                    escapeHtml(d.id || "") +
                    '</span></span><button type="button" class="ghost" data-domain-id="' +
                    escapeHtml(d.id) +
                    '">Remove</button></div>'
                  );
                })
                .join("") ||
              '<p class="muted" style="margin:0;font-size:0.85rem">No custom domains attached.</p>';
            root.querySelectorAll("[data-domain-id]").forEach((btn) => {
              btn.addEventListener("click", async () => {
                const domainId = btn.getAttribute("data-domain-id");
                if (
                  !(await confirmAction(
                    "Remove custom domain?",
                    "This detaches the hostname from the Worker service in Cloudflare.",
                  ))
                ) {
                  return;
                }
                try {
                  await api("/api/admin/cloudflare/domains", {
                    method: "DELETE",
                    body: JSON.stringify({ domainId }),
                  });
                  setStatus(status, "Domain removed.", "ok");
                  await refreshCfDomains();
                } catch (err) {
                  setStatus(status, err.message, "err");
                }
              });
            });
          } catch (err) {
            root.innerHTML =
              '<p class="muted" style="margin:0;font-size:0.85rem">' +
              escapeHtml(err.message || "Could not load domains") +
              "</p>";
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

        function paintTeam(team, me) {
          const meEl = document.getElementById("team-me");
          if (meEl) meEl.textContent = (me && me.username) || "—";

          const users = (team && team.users) || [];
          const usersRoot = document.getElementById("team-users");
          if (usersRoot) {
            usersRoot.innerHTML =
              users
                .map((u) => {
                  const isMe = me && u.id === me.id;
                  return (
                    '<div class="list-row"><span>' +
                    escapeHtml(u.username) +
                    (isMe ? ' <span class="meta">(you)</span>' : "") +
                    '</span><span class="meta">Added ' +
                    new Date(u.createdAt).toLocaleDateString() +
                    "</span></div>"
                  );
                })
                .join("") ||
              '<p class="muted" style="margin:0;font-size:0.85rem">No teammates yet.</p>';
          }

          const invites = (team && team.invites) || [];
          const invitesLabel = document.getElementById("team-invites-label");
          if (invitesLabel) invitesLabel.hidden = invites.length === 0;
          const invitesRoot = document.getElementById("team-invites");
          if (invitesRoot) {
            invitesRoot.innerHTML = invites
              .map((inv) => {
                return (
                  '<div class="list-row"><span>Invited by ' +
                  escapeHtml(inv.createdByUsername) +
                  ' <span class="meta">expires ' +
                  new Date(inv.expiresAt).toLocaleString() +
                  '</span></span><button type="button" class="ghost" data-revoke-invite="' +
                  escapeHtml(inv.id) +
                  '">Revoke</button></div>'
                );
              })
              .join("");
            invitesRoot.querySelectorAll("[data-revoke-invite]").forEach((btn) => {
              btn.addEventListener("click", () => {
                revokeInviteById(btn.getAttribute("data-revoke-invite"));
              });
            });
          }
        }

        async function revokeInviteById(id) {
          if (!id) return;
          const status = document.getElementById("team-status");
          if (!(await confirmAction("Revoke invite?", "This invite link will stop working immediately."))) {
            return;
          }
          try {
            await api("/api/admin/invites/" + encodeURIComponent(id), { method: "DELETE" });
            setStatus(status, "Invite revoked.", "ok");
            await loadDashboard();
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        }

        function paintActivity(events) {
          const root = document.getElementById("activity-list");
          if (!root) return;
          const rows = events || [];
          if (rows.length === 0) {
            root.innerHTML = '<p class="muted" style="margin:0;font-size:0.85rem">No activity recorded yet.</p>';
            return;
          }
          root.innerHTML = rows
            .map((e) => {
              return (
                '<div class="list-row"><span>' +
                escapeHtml(e.summary) +
                '</span><span class="meta">' +
                escapeHtml(e.actorUsername) +
                " · " +
                new Date(e.at).toLocaleString() +
                "</span></div>"
              );
            })
            .join("");
        }

        async function loadActivity() {
          const status = document.getElementById("activity-status");
          try {
            const data = await api("/api/admin/audit");
            paintActivity(data.events);
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        }

        document.getElementById("refresh-activity").addEventListener("click", () => {
          loadActivity().catch(() => {});
        });

        document.getElementById("create-invite").addEventListener("click", async () => {
          const status = document.getElementById("team-status");
          const btn = document.getElementById("create-invite");
          try {
            btn.disabled = true;
            const data = await api("/api/admin/invites", { method: "POST", body: "{}" });
            const urlInput = document.getElementById("team-invite-url");
            const wrap = document.getElementById("team-new-invite");
            if (urlInput && wrap) {
              urlInput.value = data.acceptUrl || "";
              wrap.hidden = false;
            }
            setStatus(status, "Invite created — copy the link below (shown once).", "ok");
            await loadDashboard();
          } catch (err) {
            setStatus(status, err.message, "err");
          } finally {
            btn.disabled = false;
          }
        });

        document.getElementById("copy-invite-url").addEventListener("click", async () => {
          const status = document.getElementById("team-status");
          const urlInput = document.getElementById("team-invite-url");
          try {
            await navigator.clipboard.writeText(urlInput.value);
            setStatus(status, "Invite link copied.", "ok");
          } catch {
            urlInput.select();
            setStatus(status, "Select and copy the link above.", "ok");
          }
        });

        async function boot() {
          fillBrandingInputs("b-", defaults);
          document.getElementById("setup-queue").value = defaultQueue;
          document.getElementById("dash-queue").value = defaultQueue;

          const params = new URLSearchParams(window.location.search);
          const bootData = await api("/api/admin/bootstrap");
          state.setupComplete = bootData.setupComplete;
          state.turnstileSitekey = bootData.turnstileSitekey || null;
          if (!bootData.setupComplete && bootData.setupPending) {
            state.cloudflareReady = !!bootData.setupPending.cloudflareReady;
            state.turnstileReady = !!bootData.setupPending.turnstileReady;
            if (bootData.setupPending.turnstileSitekey) {
              state.turnstileSitekey = bootData.setupPending.turnstileSitekey;
            }
            if (bootData.setupPending.zoneId) {
              document.getElementById("setup-cf-zone").value = bootData.setupPending.zoneId;
            }
            if (bootData.setupPending.hostname) {
              document.getElementById("setup-cf-hostname").value = bootData.setupPending.hostname;
            }
            if (bootData.setupPending.sslIsStrict) {
              state.cfSslDone = true;
              state.cfSslSkipped = false;
            }
            if (bootData.setupPending.hostnameAttached) {
              state.cfDomainDone = true;
              state.cfDomainSkipped = false;
            }
            paintSetupCloudflareUi(null, bootData.setupPending);
            if (state.cloudflareReady && state.cfSslDone) {
              state.cfSubStep = 3;
            } else if (state.cloudflareReady) {
              state.cfSubStep = 2;
            } else {
              state.cfSubStep = 1;
            }
          }

          if (params.get("invite")) {
            showView("invite");
            syncPasswordChecklist("invite");
            document.getElementById("invite-accept-btn").disabled = !syncPasswordChecklist("invite");
            if (state.turnstileSitekey) {
              renderTurnstile("invite-turnstile", state.turnstileSitekey, "invite");
            }
            return;
          }

          if (!bootData.setupComplete) {
            showView("wizard");
            setWizardStep(1);
            return;
          }
          // Setup already finished — never show claim wizard (incl. after browser Back).
          try {
            await loadDashboard();
          } catch (err) {
            if (err.status === 401) {
              showView("login");
              if (state.turnstileSitekey) {
                renderTurnstile("login-turnstile", state.turnstileSitekey, "login");
              }
            } else setStatus(document.getElementById("login-status"), err.message, "err");
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
          const status = document.getElementById("wizard-status");
          setStatus(status, "", "ok");
          if (state.step === 2 && state.cfSubStep > 1) {
            state.cfSubStep -= 1;
            setWizardStep(2);
            return;
          }
          setWizardStep(Math.max(1, state.step - 1));
        });

        document.getElementById("wizard-next").addEventListener("click", async () => {
          const status = document.getElementById("wizard-status");
          setStatus(status, "", "ok");
          if (state.step === 1) {
            const tokenSecret = document.getElementById("setup-token-secret").value.trim();
            const username = document.getElementById("setup-username").value.trim();
            if (tokenSecret.length < 16) {
              setStatus(status, "TOKEN_SECRET must be at least 16 characters.", "err");
              return;
            }
            const usernameProblem = usernameError(username);
            if (usernameProblem) {
              setStatus(status, usernameProblem, "err");
              return;
            }
            if (!syncPasswordChecklist("setup")) {
              setStatus(status, "Meet all password requirements before continuing.", "err");
              return;
            }
            if (state.cloudflareReady && state.cfSslDone) {
              state.cfSubStep = 3;
            } else if (state.cloudflareReady) {
              state.cfSubStep = 2;
            } else {
              state.cfSubStep = 1;
            }
            setWizardStep(2);
            return;
          }
          if (state.step === 2) {
            if (state.cfSubStep === 1) {
              if (!state.cloudflareReady) {
                setStatus(status, "Click to verify Cloudflare (proxied DNS must pass) before continuing.", "err");
                return;
              }
              state.cfSubStep = 2;
              setWizardStep(2);
              return;
            }
            if (state.cfSubStep === 2) {
              if (!state.cfSslDone) {
                setStatus(status, "Set Full (strict) or Skip for now before continuing.", "err");
                return;
              }
              state.cfSubStep = 3;
              setWizardStep(2);
              return;
            }
            if (state.cfSubStep === 3) {
              if (!state.cfDomainDone) {
                setStatus(status, "Attach a custom domain or Skip for now before continuing.", "err");
                return;
              }
              setWizardStep(3);
              return;
            }
          }
          if (state.step === 3) {
            if (!state.turnstileReady) {
              setStatus(status, "Create the Turnstile widget, complete the challenge, then Click to verify.", "err");
              return;
            }
            setWizardStep(4);
            return;
          }
          if (state.step === 4) {
            setWizardStep(5);
            return;
          }
          try {
            document.getElementById("wizard-next").disabled = true;
            await api("/api/admin/setup", {
              method: "POST",
              headers: setupBearerHeaders(),
              body: JSON.stringify({
                username: document.getElementById("setup-username").value.trim(),
                password: document.getElementById("setup-password").value,
                confirmPassword: document.getElementById("setup-confirm").value,
                queue: document.getElementById("setup-queue").value,
                admissionMode: state.admissionMode,
                branding: wizardBranding(),
              }),
            });
            state.setupComplete = true;
            window.history.replaceState({}, "", window.location.pathname);
            await loadDashboard();
            setStatus(document.getElementById("dash-status"), "Setup complete.", "ok");
          } catch (err) {
            setStatus(status, err.message, "err");
          } finally {
            document.getElementById("wizard-next").disabled = false;
          }
        });

        document.getElementById("setup-cf-verify").addEventListener("click", async () => {
          const status = document.getElementById("setup-cf-status");
          const hintsEl = document.getElementById("setup-cf-hints");
          const btn = document.getElementById("setup-cf-verify");
          const apiToken = document.getElementById("setup-cf-token").value.trim();
          const hostname = document.getElementById("setup-cf-hostname").value.trim();
          const zoneId = document.getElementById("setup-cf-zone").value.trim();
          if (apiToken.length < 20) {
            setWizardHints(hintsEl, [
              "Paste the API token from dash.cloudflare.com/profile/api-tokens (Create Custom Token).",
            ]);
            setStatus(status, "Cloudflare API token looks too short or empty.", "err");
            return;
          }
          if (!hostname) {
            setWizardHints(hintsEl, [
              "Use the hostname visitors will hit (for example www.example.com). Zone ID can be blank if the token can look it up.",
            ]);
            setStatus(status, "Hostname is required.", "err");
            return;
          }
          try {
            btn.disabled = true;
            setWizardHints(hintsEl, []);
            setStatus(status, "Verifying…", "ok");
            const data = await api("/api/admin/setup/cloudflare/verify", {
              method: "POST",
              headers: setupBearerHeaders(),
              body: JSON.stringify({
                apiToken,
                zoneId,
                hostname,
                workerService: document.getElementById("setup-cf-worker").value.trim() || "tideguard",
              }),
            });
            if (data.verify && data.verify.zone && data.verify.zone.zoneId) {
              document.getElementById("setup-cf-zone").value = data.verify.zone.zoneId;
            }
            paintSetupCloudflareUi(data.verify, data.pending);
          } catch (err) {
            state.cloudflareReady = false;
            document.getElementById("wizard-next").disabled = true;
            setWizardHints(hintsEl, []);
            setStatus(status, err.message, "err");
          } finally {
            btn.disabled = false;
          }
        });

        document.getElementById("setup-cf-fix").addEventListener("click", async () => {
          const status = document.getElementById("setup-cf-status");
          const hintsEl = document.getElementById("setup-cf-hints");
          try {
            setStatus(status, "Fixing…", "ok");
            const data = await api("/api/admin/setup/cloudflare/fix", {
              method: "POST",
              headers: setupBearerHeaders(),
              body: "{}",
            });
            paintSetupCloudflareUi(
              data.check
                ? { proxy: data.check, ssl: null, domains: { hostnameAttached: data.pending && data.pending.hostnameAttached } }
                : null,
              data.pending,
            );
          } catch (err) {
            setWizardHints(hintsEl, []);
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("setup-cf-ssl").addEventListener("click", async () => {
          if (
            !(await confirmAction(
              "Set SSL to Full (strict)?",
              "Full (strict) requires a valid certificate on your origin. Wrong mode can cause Error 526 for visitors.",
            ))
          ) {
            return;
          }
          try {
            const data = await api("/api/admin/setup/cloudflare/ssl", {
              method: "POST",
              headers: setupBearerHeaders(),
              body: "{}",
            });
            state.cfSslDone = true;
            state.cfSslSkipped = false;
            paintSetupCloudflareUi(
              data.ssl
                ? {
                    proxy: { ok: data.pending && data.pending.proxyOk, summary: "SSL updated" },
                    ssl: data.ssl,
                    domains: { hostnameAttached: data.pending && data.pending.hostnameAttached },
                  }
                : null,
              data.pending,
            );
            paintCfSubSteps();
            document.getElementById("wizard-next").disabled = !cfSubStepContinueEnabled();
          } catch (err) {
            setStatus(document.getElementById("setup-cf-status"), err.message, "err");
          }
        });

        document.getElementById("setup-cf-ssl-skip").addEventListener("click", () => {
          state.cfSslDone = true;
          state.cfSslSkipped = true;
          paintCfSubSteps();
          document.getElementById("wizard-next").disabled = !cfSubStepContinueEnabled();
        });

        document.getElementById("setup-cf-domain").addEventListener("click", async () => {
          const status = document.getElementById("setup-cf-domain-status");
          try {
            setStatus(status, "Attaching domain…", "ok");
            const data = await api("/api/admin/setup/cloudflare/attach-domain", {
              method: "POST",
              headers: setupBearerHeaders(),
              body: "{}",
            });
            state.cfDomainDone = true;
            state.cfDomainSkipped = false;
            paintSetupCloudflareUi(null, data.pending);
            setStatus(status, "Custom domain attached.", "ok");
            paintCfSubSteps();
            document.getElementById("wizard-next").disabled = !cfSubStepContinueEnabled();
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("setup-cf-domain-skip").addEventListener("click", () => {
          state.cfDomainDone = true;
          state.cfDomainSkipped = true;
          paintCfSubSteps();
          document.getElementById("wizard-next").disabled = !cfSubStepContinueEnabled();
        });

        document.getElementById("setup-ts-provision").addEventListener("click", async () => {
          const status = document.getElementById("setup-ts-status");
          const hintsEl = document.getElementById("setup-ts-hints");
          const btn = document.getElementById("setup-ts-provision");
          try {
            btn.disabled = true;
            setWizardHints(hintsEl, []);
            setStatus(status, "Creating widget…", "ok");
            const data = await api("/api/admin/setup/turnstile/provision", {
              method: "POST",
              headers: setupBearerHeaders(),
              body: "{}",
            });
            state.turnstileSitekey = data.sitekey || (data.pending && data.pending.turnstileSitekey) || null;
            if (data.pending && data.pending.turnstileReady != null) {
              state.turnstileReady = !!data.pending.turnstileReady;
            }
            if (state.turnstileSitekey) {
              renderTurnstile("setup-ts-widget", state.turnstileSitekey, "setup");
              setWizardHints(hintsEl, [
                "Complete the challenge below, then Click to verify so TideGuard can confirm siteverify.",
              ]);
              setStatus(status, "Widget ready — complete the challenge, then Click to verify.", "ok");
            } else {
              setStatus(status, "Provision succeeded but no sitekey returned.", "err");
            }
          } catch (err) {
            setWizardHints(hintsEl, [
              "Cloudflare step must be verified first. Token needs Account → Turnstile → Edit.",
            ]);
            setStatus(status, err.message, "err");
          } finally {
            btn.disabled = false;
          }
        });

        document.getElementById("setup-ts-verify").addEventListener("click", async () => {
          const status = document.getElementById("setup-ts-status");
          const hintsEl = document.getElementById("setup-ts-hints");
          const btn = document.getElementById("setup-ts-verify");
          const turnstileToken = getTurnstileToken("setup");
          if (!turnstileToken) {
            setWizardHints(hintsEl, [
              "If no widget is visible, click Create Turnstile widget first.",
            ]);
            setStatus(status, "Complete the Turnstile challenge first.", "err");
            return;
          }
          try {
            btn.disabled = true;
            const data = await api("/api/admin/setup/turnstile/verify", {
              method: "POST",
              headers: setupBearerHeaders(),
              body: JSON.stringify({ turnstileToken }),
            });
            state.turnstileReady = !!(data.pending && data.pending.turnstileReady) || !!data.ok;
            if (state.step === 3) {
              document.getElementById("wizard-next").disabled = !state.turnstileReady;
            }
            setWizardHints(hintsEl, []);
            setStatus(status, state.turnstileReady ? "Turnstile verified." : "Verification incomplete.", state.turnstileReady ? "ok" : "err");
            resetTurnstile("setup");
          } catch (err) {
            state.turnstileReady = false;
            resetTurnstile("setup");
            setWizardHints(hintsEl, [
              "Refresh the challenge and Click to verify again. For local dev, widget domains include localhost.",
            ]);
            setStatus(status, err.message, "err");
          } finally {
            btn.disabled = false;
          }
        });

        document.getElementById("login-btn").addEventListener("click", async () => {
          const status = document.getElementById("login-status");
          try {
            await api("/api/admin/login", {
              method: "POST",
              body: JSON.stringify({
                username: document.getElementById("login-username").value.trim(),
                password: document.getElementById("login-password").value,
                turnstileToken: getTurnstileToken("login"),
              }),
            });
            await loadDashboard();
          } catch (err) {
            resetTurnstile("login");
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("invite-accept-btn").addEventListener("click", async () => {
          const status = document.getElementById("invite-status");
          setStatus(status, "", "ok");
          const params = new URLSearchParams(window.location.search);
          const token = params.get("invite") || "";
          const username = document.getElementById("invite-username").value.trim();
          const usernameProblem = usernameError(username);
          if (usernameProblem) {
            setStatus(status, usernameProblem, "err");
            return;
          }
          if (!syncPasswordChecklist("invite")) {
            setStatus(status, "Meet all password requirements before joining.", "err");
            return;
          }
          const password = document.getElementById("invite-password").value;
          const confirm = document.getElementById("invite-confirm").value;
          const btn = document.getElementById("invite-accept-btn");
          try {
            btn.disabled = true;
            await api("/api/admin/invites/accept", {
              method: "POST",
              body: JSON.stringify({
                token,
                username,
                password,
                confirmPassword: confirm,
                turnstileToken: getTurnstileToken("invite"),
              }),
            });
            window.history.replaceState({}, "", window.location.pathname);
            await loadDashboard();
          } catch (err) {
            resetTurnstile("invite");
            setStatus(status, err.message, "err");
          } finally {
            btn.disabled = !syncPasswordChecklist("invite");
          }
        });

        document.getElementById("logout-btn").addEventListener("click", async () => {
          stopMetricsPoll();
          await api("/api/admin/logout", { method: "POST", body: "{}" });
          showView("login");
          if (state.turnstileSitekey) {
            renderTurnstile("login-turnstile", state.turnstileSitekey, "login");
          }
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
          const modeLabel = state.admissionMode === "lottery" ? "Lottery" : "Queue";
          if (
            !(await confirmAction(
              "Apply mode change?",
              "Switch admission mode to " + modeLabel + " mode. This takes effect immediately for waiting visitors.",
            ))
          ) {
            return;
          }
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
          const willEnable = document.getElementById("origin-enabled").checked;
          if (
            !(await confirmAction(
              willEnable ? "Enable origin proxy?" : "Disable origin proxy?",
              willEnable
                ? "Protected paths will be proxied to your origin URL immediately."
                : "Origin proxying will stop immediately for protected paths.",
            ))
          ) {
            return;
          }
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
          if (
            !(await confirmAction(
              "Pass the queue?",
              "This issues an admission cookie for this browser and skips the waiting room entirely.",
            ))
          ) {
            return;
          }
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
          const willEnable = document.getElementById("geo-enabled").checked;
          if (
            !(await confirmAction(
              willEnable ? "Enable country block?" : "Save country block settings?",
              willEnable
                ? "Visitors from the listed countries will be blocked immediately."
                : "Country block will be saved but remain inactive.",
            ))
          ) {
            return;
          }
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
          if (
            !(await confirmAction("Disable country block?", "This immediately stops blocking any countries."))
          ) {
            return;
          }
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
                workerService: document.getElementById("cf-worker-service").value.trim() || "tideguard",
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
          if (
            !(await confirmAction(
              "Clear API token?",
              "The saved Cloudflare API token will be removed. Paste it again to use Check/Fix setup.",
            ))
          ) {
            return;
          }
          try {
            const data = await api("/api/admin/cloudflare", {
              method: "PUT",
              body: JSON.stringify({
                zoneId: document.getElementById("cf-zone-id").value,
                hostname: document.getElementById("cf-hostname").value,
                workerService: document.getElementById("cf-worker-service").value.trim() || "tideguard",
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
            paintCloudflareCheck(check);
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
        document.getElementById("fix-cloudflare-proxy").addEventListener("click", async () => {
          if (
            !(await confirmAction(
              "Fix Cloudflare setup?",
              "This will change DNS proxy status and IP Geolocation settings for this hostname on Cloudflare.",
            ))
          ) {
            return;
          }
          runCloudflareAction("/api/admin/cloudflare/fix-proxy", "Setup updated");
        });

        document.getElementById("cf-ip-geo").addEventListener("change", async () => {
          const status = document.getElementById("cloudflare-status");
          const enabled = document.getElementById("cf-ip-geo").checked;
          if (!enabled) {
            if (
              !(await confirmAction(
                "Disable IP Geolocation?",
                "Country block needs CF-IPCountry. Disabling geolocation will also clear any active country block.",
              ))
            ) {
              document.getElementById("cf-ip-geo").checked = true;
              return;
            }
          }
          try {
            const data = await api("/api/admin/cloudflare/ip-geolocation", {
              method: "PUT",
              body: JSON.stringify({ enabled }),
            });
            const on = !!(data.ipGeolocation && data.ipGeolocation.on);
            document.getElementById("cf-ip-geo").checked = on;
            setStatus(status, on ? "IP Geolocation enabled." : "IP Geolocation disabled.", "ok");
          } catch (err) {
            document.getElementById("cf-ip-geo").checked = !enabled;
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("cf-ssl-strict").addEventListener("click", async () => {
          const status = document.getElementById("cloudflare-status");
          if (
            !(await confirmAction(
              "Set SSL to Full (strict)?",
              "Full (strict) requires a valid certificate on your origin. Wrong mode can cause Error 526 for visitors.",
            ))
          ) {
            return;
          }
          try {
            const data = await api("/api/admin/cloudflare/ssl", { method: "PUT", body: "{}" });
            const ssl = data.ssl || {};
            const sslEl = document.getElementById("cf-ssl-status");
            sslEl.textContent =
              "SSL/TLS: " + (ssl.mode || "strict") + (ssl.isStrict ? " (Full strict)" : "");
            sslEl.classList.toggle("warn", !ssl.isStrict);
            setStatus(status, "SSL set to Full (strict).", "ok");
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        });

        document.getElementById("cf-domains-refresh").addEventListener("click", () => {
          refreshCfDomains();
        });

        document.getElementById("cf-domain-add").addEventListener("click", async () => {
          const status = document.getElementById("cloudflare-status");
          const hostname = document.getElementById("cf-domain-hostname").value.trim();
          if (!hostname) {
            setStatus(status, "Enter a hostname to attach.", "err");
            return;
          }
          try {
            await api("/api/admin/cloudflare/domains", {
              method: "PUT",
              body: JSON.stringify({ hostname }),
            });
            document.getElementById("cf-domain-hostname").value = "";
            setStatus(status, "Custom domain attached.", "ok");
            await refreshCfDomains();
          } catch (err) {
            setStatus(status, err.message, "err");
          }
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
          if (
            !(await confirmAction(
              "Open the room now?",
              "This clears the scheduled opening time and opens the waiting room immediately.",
            ))
          ) {
            return;
          }
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
          const willPause = document.getElementById("traffic-paused").checked;
          if (
            !(await confirmAction(
              willPause ? "Pause admissions?" : "Resume admissions?",
              willPause
                ? "Visitors stop being admitted immediately. This is silent — they are not told."
                : "Admissions resume immediately.",
            ))
          ) {
            return;
          }
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

        function paintUpdateCheck(data) {
          const detail = document.getElementById("update-detail");
          const summary = document.getElementById("update-summary");
          const link = document.getElementById("update-release-link");
          const current = data.currentVersion || appVersion;
          summary.innerHTML =
            "Running <strong style=\\"color:var(--text)\\">v" +
            escapeHtml(current) +
            "</strong>. Checked against GitHub Releases.";
          detail.textContent = data.message || "—";
          if (data.updateAvailable && (data.releaseUrl || data.releasesUrl)) {
            link.hidden = false;
            link.style.display = "inline-flex";
            link.href = data.releaseUrl || data.releasesUrl;
            link.textContent = data.latestTag
              ? "Open " + data.latestTag
              : "Release notes";
          } else {
            link.hidden = true;
            link.style.display = "none";
            link.href = data.releasesUrl || "https://github.com/TideGuard/TideGuard/releases";
          }
        }

        function escapeHtml(value) {
          return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
        }

        async function refreshUpdates(force) {
          const status = document.getElementById("update-status");
          try {
            const q = force ? "?refresh=1" : "";
            const data = await api("/api/admin/updates" + q);
            paintUpdateCheck(data);
            setStatus(
              status,
              data.updateAvailable ? "Update available" : data.source === "unavailable" ? "Check failed" : "Checked",
              data.updateAvailable || data.source === "unavailable" ? "err" : "ok",
            );
          } catch (err) {
            setStatus(status, err.message, "err");
          }
        }

        document.getElementById("check-updates").addEventListener("click", () => {
          refreshUpdates(true);
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

        wirePasswordChecklist("setup", () => {
          if (state.step === 1) {
            document.getElementById("wizard-next").disabled = !accountStepReady();
          }
        });
        wirePasswordChecklist("invite", () => {
          document.getElementById("invite-accept-btn").disabled = !syncPasswordChecklist("invite");
        });
        document.getElementById("invite-username").addEventListener("input", () => {
          document.getElementById("invite-accept-btn").disabled = !syncPasswordChecklist("invite");
        });

        window.addEventListener("pageshow", (event) => {
          if (!event.persisted) return;
          boot().catch(() => {
            if (state.setupComplete) showView("login");
          });
        });

        boot().catch((err) => {
          showView(initialSetupComplete ? "login" : "wizard");
          if (initialSetupComplete) {
            setStatus(document.getElementById("login-status"), err.message || "Could not load admin", "err");
          } else {
            setStatus(document.getElementById("wizard-status"), err.message || "Could not load admin", "err");
          }
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
