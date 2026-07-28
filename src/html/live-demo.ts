import { PRODUCT_STATUS } from "../core/product-status";
import { DEMO_LIMITS } from "../demo/session";

/**
 * Live demo UI — talks to real Worker/DO demo APIs (not a hardcoded simulation).
 */
export function renderLiveDemoPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Live demo · TideGuard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,650&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
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
      .wrap { width: min(100% - 2rem, 44rem); margin: 0 auto; padding: 2rem 0 3rem; }
      .top { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
      .brand { margin: 0; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
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
        margin: 1rem 0 0.5rem;
        font-family: "Fraunces", Georgia, serif;
        font-weight: 650;
        font-size: clamp(1.9rem, 5vw, 2.6rem);
        letter-spacing: -0.02em;
      }
      .lede { color: var(--muted); line-height: 1.55; margin: 0 0 1rem; }
      .live {
        margin: 0 0 1.25rem;
        padding: 0.65rem 0.8rem;
        border-left: 3px solid var(--accent);
        background: color-mix(in oklab, var(--accent) 12%, transparent);
        color: var(--text);
        font-size: 0.95rem;
      }
      .panel {
        border-top: 1px solid var(--line);
        padding-top: 1rem;
        margin-top: 1.25rem;
      }
      .panel h2 {
        margin: 0 0 0.75rem;
        font-family: "Fraunces", Georgia, serif;
        font-size: 1.15rem;
        font-weight: 650;
      }
      .grid {
        display: grid;
        gap: 0.65rem;
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      }
      .stat {
        border-top: 1px solid var(--line);
        padding-top: 0.45rem;
      }
      .stat .label { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
      .stat .value { font-size: 1.25rem; font-variant-numeric: tabular-nums; font-weight: 700; }
      .actions { display: flex; flex-wrap: wrap; gap: 0.55rem; margin-top: 0.9rem; }
      button, .btn {
        border: 1px solid var(--line);
        background: transparent;
        color: var(--text);
        font: inherit;
        padding: 0.55rem 0.85rem;
        border-radius: 0.45rem;
        cursor: pointer;
        text-decoration: none;
      }
      button.primary, .btn.primary {
        background: var(--accent);
        color: #042028;
        border-color: transparent;
        font-weight: 600;
      }
      button:focus-visible, .btn:focus-visible, input:focus-visible {
        outline: 2px solid color-mix(in oklab, var(--accent) 70%, transparent);
        outline-offset: 2px;
      }
      label { display: grid; gap: 0.3rem; margin: 0.75rem 0; font-size: 0.92rem; }
      label span { color: var(--muted); }
      input {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 0.4rem;
        background: color-mix(in oklab, var(--bg) 70%, black);
        color: var(--text);
        font: inherit;
        padding: 0.55rem 0.7rem;
      }
      .status { min-height: 1.4rem; margin-top: 0.75rem; color: var(--muted); }
      .status[data-tone="err"] { color: var(--danger); }
      .status[data-tone="ok"] { color: var(--accent-2); }
      .hint { color: var(--muted); font-size: 0.9rem; line-height: 1.45; }
      code { font-size: 0.9em; color: var(--text); }
      @media (prefers-reduced-motion: reduce) {
        * { animation: none !important; transition: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="top">
        <p class="brand">TideGuard <span class="badge">${PRODUCT_STATUS.label}</span></p>
        <a href="/">Home</a>
      </div>
      <h1>Live demo</h1>
      <p class="lede">${PRODUCT_STATUS.headline}</p>
      <p class="live" id="live-banner">Live demo — powered by a real TideGuard Worker and Durable Object.</p>

      <section class="panel">
        <h2>Session</h2>
        <div class="actions">
          <button type="button" class="primary" id="start-demo">Start demo session</button>
          <button type="button" id="copy-link" disabled>Copy demo link</button>
          <a class="btn" id="open-second" href="#" hidden target="_blank" rel="noopener">Open second visitor</a>
        </div>
        <p class="hint">Open this demo link in another browser or private window to see multiple real queue positions.</p>
        <div class="grid" style="margin-top:1rem">
          <div class="stat"><span class="label">Session</span><span class="value" id="s-id">—</span></div>
          <div class="stat"><span class="label">Queue</span><span class="value" id="s-queue">—</span></div>
          <div class="stat"><span class="label">Expires</span><span class="value" id="s-exp">—</span></div>
        </div>
      </section>

      <section class="panel">
        <h2>Your place in line</h2>
        <div class="actions">
          <button type="button" class="primary" id="join-btn" disabled>Join queue</button>
          <a class="btn" id="protected-link" href="#" hidden>Open protected page</a>
        </div>
        <div class="grid" style="margin-top:1rem">
          <div class="stat"><span class="label">Visitor</span><span class="value" id="v-id">—</span></div>
          <div class="stat"><span class="label">Status</span><span class="value" id="v-status">—</span></div>
          <div class="stat"><span class="label">Position</span><span class="value" id="v-pos">—</span></div>
          <div class="stat"><span class="label">Est. wait</span><span class="value" id="v-eta">—</span></div>
          <div class="stat"><span class="label">Polling</span><span class="value" id="v-poll">idle</span></div>
          <div class="stat"><span class="label">Updated</span><span class="value" id="v-updated">—</span></div>
        </div>
        <p class="status" id="visitor-status" aria-live="polite" data-tone="ok"></p>
      </section>

      <section class="panel">
        <h2>Demo controller</h2>
        <p class="hint">Limited to this session only. Cannot access other queues, admin, or secrets. Admit rate max ${DEMO_LIMITS.maxAdmitPerSecond}/s.</p>
        <label>
          <span>Admit rate (per second)</span>
          <input id="admit-rate" type="number" min="${DEMO_LIMITS.minAdmitPerSecond}" max="${DEMO_LIMITS.maxAdmitPerSecond}" step="0.1" value="${DEMO_LIMITS.defaultAdmitPerSecond}" disabled />
        </label>
        <div class="actions">
          <button type="button" class="primary" id="admit-btn" disabled>Admit next</button>
          <button type="button" id="pause-btn" disabled>Pause</button>
          <button type="button" id="resume-btn" disabled>Resume</button>
          <button type="button" id="apply-rate" disabled>Apply rate</button>
          <button type="button" id="reset-btn" disabled>Reset demo</button>
        </div>
        <p class="status" id="ctrl-status" aria-live="polite" data-tone="ok"></p>
      </section>
    </div>
    <script>
      (() => {
        const state = {
          sessionId: null,
          queue: null,
          controllerToken: null,
          visitorId: null,
          pollTimer: null,
          hbTimer: null,
          paused: false,
        };

        const els = {
          start: document.getElementById("start-demo"),
          copy: document.getElementById("copy-link"),
          openSecond: document.getElementById("open-second"),
          join: document.getElementById("join-btn"),
          protected: document.getElementById("protected-link"),
          admit: document.getElementById("admit-btn"),
          pause: document.getElementById("pause-btn"),
          resume: document.getElementById("resume-btn"),
          applyRate: document.getElementById("apply-rate"),
          reset: document.getElementById("reset-btn"),
          rate: document.getElementById("admit-rate"),
          visitorStatus: document.getElementById("visitor-status"),
          ctrlStatus: document.getElementById("ctrl-status"),
        };

        function setText(id, value) {
          document.getElementById(id).textContent = value;
        }

        function setStatus(el, text, tone) {
          el.textContent = text || "";
          el.dataset.tone = tone || "ok";
        }

        function demoUrl() {
          if (!state.sessionId) return location.href;
          const url = new URL(location.href);
          url.searchParams.set("session", state.sessionId);
          return url.toString();
        }

        function enableSessionControls(on) {
          els.copy.disabled = !on;
          els.join.disabled = !on;
          els.admit.disabled = !on;
          els.pause.disabled = !on;
          els.resume.disabled = !on;
          els.applyRate.disabled = !on;
          els.reset.disabled = !on;
          els.rate.disabled = !on;
        }

        async function api(path, options = {}) {
          const headers = { "content-type": "application/json", ...(options.headers || {}) };
          if (state.controllerToken && options.controller) {
            headers["x-tideguard-demo-controller"] = state.controllerToken;
          }
          const res = await fetch(path, {
            credentials: "same-origin",
            ...options,
            headers,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err = new Error((data.error && data.error.message) || "Request failed");
            err.status = res.status;
            throw err;
          }
          return data;
        }

        function stopPolling() {
          if (state.pollTimer) clearInterval(state.pollTimer);
          if (state.hbTimer) clearInterval(state.hbTimer);
          state.pollTimer = null;
          state.hbTimer = null;
          setText("v-poll", "idle");
        }

        function startPolling() {
          stopPolling();
          setText("v-poll", "active");
          state.pollTimer = setInterval(() => refreshStatus().catch(() => {}), 5000);
          state.hbTimer = setInterval(() => {
            if (!state.visitorId || !state.sessionId) return;
            api("/api/demo/" + state.sessionId + "/heartbeat", {
              method: "POST",
              body: JSON.stringify({ visitorId: state.visitorId }),
            }).catch(() => {});
          }, 20000);
        }

        function paintVisitor(data) {
          state.visitorId = data.visitorId;
          setText("v-id", shortId(data.visitorId));
          setText("v-status", data.status);
          setText("v-pos", data.position == null ? "—" : String(data.position));
          setText("v-eta", data.estimatedWaitSeconds == null ? "—" : data.estimatedWaitSeconds + "s");
          setText("v-updated", new Date(data.updatedAt || Date.now()).toLocaleTimeString());
          if (data.status === "admitted") {
            els.protected.hidden = false;
            els.protected.href = "/demo/live/protected?session=" + encodeURIComponent(state.sessionId);
          }
        }

        function shortId(value) {
          if (!value) return "—";
          return value.slice(0, 8) + "…";
        }

        async function refreshStatus() {
          if (!state.sessionId || !state.visitorId) return;
          const data = await api(
            "/api/demo/" + state.sessionId + "/status?visitorId=" + encodeURIComponent(state.visitorId),
          );
          paintVisitor(data);
          if (data.paused) setStatus(els.visitorStatus, "Queue is paused.", "ok");
        }

        async function startSession(existingId) {
          stopPolling();
          let data;
          if (existingId) {
            // Join an existing session from a shared link (controller stays with creator).
            state.sessionId = existingId;
            state.queue = null;
            state.controllerToken = sessionStorage.getItem("tg_demo_ctrl_" + existingId);
            setText("s-id", shortId(existingId));
            setText("s-queue", "…");
            setText("s-exp", "shared");
            enableSessionControls(Boolean(state.controllerToken));
            els.join.disabled = false;
            els.copy.disabled = false;
            els.openSecond.hidden = false;
            els.openSecond.href = demoUrl();
            setStatus(els.ctrlStatus, state.controllerToken ? "Controller available." : "Visitor mode (no controller on this browser).", "ok");
            return;
          }
          data = await api("/api/demo/session", { method: "POST", body: "{}" });
          state.sessionId = data.sessionId;
          state.queue = data.queue;
          state.controllerToken = data.controllerToken;
          sessionStorage.setItem("tg_demo_ctrl_" + data.sessionId, data.controllerToken);
          setText("s-id", shortId(data.sessionId));
          setText("s-queue", data.queue);
          setText("s-exp", new Date(data.expiresAt).toLocaleTimeString());
          enableSessionControls(true);
          els.openSecond.hidden = false;
          els.openSecond.href = demoUrl();
          history.replaceState({}, "", demoUrl());
          setStatus(els.ctrlStatus, "Session created.", "ok");
        }

        els.start.addEventListener("click", async () => {
          try {
            await startSession(null);
            setStatus(els.visitorStatus, "Session ready. Join the queue.", "ok");
          } catch (err) {
            setStatus(els.visitorStatus, err.message, "err");
          }
        });

        els.join.addEventListener("click", async () => {
          try {
            const data = await api("/api/demo/" + state.sessionId + "/join", {
              method: "POST",
              body: JSON.stringify({}),
            });
            state.queue = data.queue;
            setText("s-queue", data.queue);
            paintVisitor({ ...data, updatedAt: Date.now() });
            startPolling();
            setStatus(els.visitorStatus, "Joined live queue.", "ok");
          } catch (err) {
            setStatus(els.visitorStatus, err.message, "err");
          }
        });

        els.copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(demoUrl());
            setStatus(els.ctrlStatus, "Demo link copied.", "ok");
          } catch {
            setStatus(els.ctrlStatus, demoUrl(), "ok");
          }
        });

        els.admit.addEventListener("click", async () => {
          try {
            const data = await api("/api/demo/" + state.sessionId + "/admit", {
              method: "POST",
              controller: true,
              body: "{}",
            });
            setStatus(els.ctrlStatus, "Admitted " + (data.admitted || []).length + " visitor(s).", "ok");
            await refreshStatus();
          } catch (err) {
            setStatus(els.ctrlStatus, err.message, "err");
          }
        });

        els.pause.addEventListener("click", async () => {
          try {
            await api("/api/demo/" + state.sessionId + "/pause", {
              method: "POST",
              controller: true,
              body: JSON.stringify({ paused: true }),
            });
            setStatus(els.ctrlStatus, "Demo queue paused.", "ok");
          } catch (err) {
            setStatus(els.ctrlStatus, err.message, "err");
          }
        });

        els.resume.addEventListener("click", async () => {
          try {
            await api("/api/demo/" + state.sessionId + "/pause", {
              method: "POST",
              controller: true,
              body: JSON.stringify({ paused: false }),
            });
            setStatus(els.ctrlStatus, "Demo queue resumed.", "ok");
          } catch (err) {
            setStatus(els.ctrlStatus, err.message, "err");
          }
        });

        els.applyRate.addEventListener("click", async () => {
          try {
            const data = await api("/api/demo/" + state.sessionId + "/rate", {
              method: "POST",
              controller: true,
              body: JSON.stringify({ admitPerSecond: Number(els.rate.value) }),
            });
            setStatus(els.ctrlStatus, "Admit rate set to " + data.admitPerSecond + "/s.", "ok");
          } catch (err) {
            setStatus(els.ctrlStatus, err.message, "err");
          }
        });

        els.reset.addEventListener("click", async () => {
          try {
            const data = await api("/api/demo/" + state.sessionId + "/reset", {
              method: "POST",
              controller: true,
              body: "{}",
            });
            stopPolling();
            state.visitorId = null;
            state.queue = data.queue;
            setText("s-queue", data.queue);
            setText("v-id", "—");
            setText("v-status", "—");
            setText("v-pos", "—");
            setText("v-eta", "—");
            els.protected.hidden = true;
            setStatus(els.ctrlStatus, "Demo reset. Join again.", "ok");
            setStatus(els.visitorStatus, "Queue regenerated for this session.", "ok");
          } catch (err) {
            setStatus(els.ctrlStatus, err.message, "err");
          }
        });

        const existing = new URL(location.href).searchParams.get("session");
        if (existing) {
          startSession(existing).catch((err) => setStatus(els.visitorStatus, err.message, "err"));
        }
      })();
    </script>
  </body>
</html>`;
}
