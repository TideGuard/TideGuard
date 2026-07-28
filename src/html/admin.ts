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
          <p class="muted">Create an admin password for this deploy. Admission tokens still use <code>TOKEN_SECRET</code> from Wrangler.</p>
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

        const views = {
          wizard: document.getElementById("view-wizard"),
          login: document.getElementById("view-login"),
          dashboard: document.getElementById("view-dashboard"),
        };

        function setStatus(el, text, tone) {
          el.textContent = text || "";
          el.dataset.tone = tone || "ok";
        }

        function showView(name) {
          views.wizard.hidden = name !== "wizard";
          views.login.hidden = name !== "login";
          views.dashboard.hidden = name !== "dashboard";
          document.getElementById("logout-btn").hidden = name !== "dashboard";
          document.getElementById("page-title").textContent =
            name === "wizard" ? "Setup" : name === "login" ? "Sign in" : "Control room";
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
          state.admissionMode = data.admissionMode;
          setModeButtons(
            document.getElementById("dash-mode-queue"),
            document.getElementById("dash-mode-lottery"),
            data.admissionMode,
          );
          document.getElementById("m-waiting").textContent = String(data.metrics.waiting);
          document.getElementById("m-admitted").textContent = String(data.metrics.admitted);
          document.getElementById("m-capacity").textContent = String(data.metrics.capacity);
          document.getElementById("m-mode").textContent = data.admissionMode;
          paintPreview("dash-preview", dashBranding(), state.admissionMode);
          showView("dashboard");
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
            const password = document.getElementById("setup-password").value;
            const confirm = document.getElementById("setup-confirm").value;
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
            await api("/api/admin/setup", {
              method: "POST",
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
          await api("/api/admin/logout", { method: "POST", body: "{}" });
          showView("login");
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
