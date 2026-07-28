import type { WaitingRoomBranding } from "../core/branding";
import { mergeBranding } from "../core/branding";

export interface WaitingRoomRenderOptions {
  queue: string;
  embed?: boolean;
  returnTo?: string;
  visitorId?: string;
  branding?: Partial<WaitingRoomBranding>;
  /** Override branding.showWaitingCount for this render (e.g. ?showWaiting=1). */
  showWaitingCount?: boolean;
  /** Status poll interval in ms. Keep >= 2000 to limit DO request volume. */
  pollIntervalMs?: number;
}

/**
 * Self-contained waiting room page (full page or embeddable iframe).
 * Joins the queue in-browser, polls /status, heartbeats, then redirects with a cookie.
 */
export function renderWaitingRoom(options: WaitingRoomRenderOptions): string {
  const branding = mergeBranding(options.branding);
  const embed = options.embed === true;
  const pollIntervalMs = Math.max(2000, options.pollIntervalMs ?? 2500);
  const returnTo = options.returnTo ?? "/demo";
  const queue = options.queue;
  const initialVisitorId = options.visitorId ?? "";
  const showWaitingCount = options.showWaitingCount ?? branding.showWaitingCount;

  return `<!DOCTYPE html>
<html lang="en" class="${embed ? "is-embed" : ""}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(branding.title)} · TideGuard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --tg-bg: ${escapeCss(branding.backgroundColor)};
        --tg-surface: ${escapeCss(branding.surfaceColor)};
        --tg-text: ${escapeCss(branding.textColor)};
        --tg-muted: ${escapeCss(branding.mutedColor)};
        --tg-primary: ${escapeCss(branding.primaryColor)};
        --tg-accent: ${escapeCss(branding.accentColor)};
        --tg-font-display: ${escapeCss(branding.fontFamily)};
        --tg-font-body: "Source Sans 3", "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        min-height: 100%;
      }
      body {
        min-height: 100vh;
        font-family: var(--tg-font-body);
        color: var(--tg-text);
        background:
          radial-gradient(ellipse 80% 60% at 10% -10%, color-mix(in oklab, var(--tg-primary) 28%, transparent), transparent 55%),
          radial-gradient(ellipse 70% 50% at 100% 0%, color-mix(in oklab, var(--tg-accent) 16%, transparent), transparent 50%),
          linear-gradient(165deg, var(--tg-bg), var(--tg-surface) 55%, #123041);
        display: grid;
        place-items: center;
        padding: 1.5rem;
      }
      html.is-embed body {
        min-height: 100%;
        padding: 1rem;
        background: var(--tg-surface);
      }
      main {
        width: min(100%, 28rem);
        text-align: center;
      }
      .brand {
        font-family: var(--tg-font-body);
        font-size: 0.85rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--tg-primary);
        margin: 0 0 1rem;
      }
      h1 {
        font-family: var(--tg-font-display);
        font-weight: 650;
        font-size: clamp(2rem, 6vw, 2.75rem);
        line-height: 1.1;
        letter-spacing: -0.02em;
        margin: 0 0 0.75rem;
        text-wrap: balance;
      }
      .message {
        margin: 0 auto 1.75rem;
        max-width: 36ch;
        line-height: 1.55;
        color: var(--tg-muted);
        text-wrap: pretty;
      }
      .progress {
        --progress: 0%;
        height: 0.35rem;
        border-radius: 999px;
        background: color-mix(in oklab, var(--tg-text) 12%, transparent);
        overflow: hidden;
        margin: 0 0 1.5rem;
      }
      .progress > span {
        display: block;
        height: 100%;
        width: var(--progress);
        border-radius: inherit;
        background: linear-gradient(90deg, var(--tg-primary), var(--tg-accent));
        transition: width 600ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
        margin: 0 0 1.25rem;
      }
      .stats[data-cols="3"] {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .stats[data-cols="4"] {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      @media (min-width: 420px) {
        .stats[data-cols="4"] {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      .stat[hidden] { display: none; }
      .stat {
        padding: 0.85rem 0.5rem 0.7rem;
        border-top: 1px solid color-mix(in oklab, var(--tg-text) 14%, transparent);
      }
      .stat .label {
        display: block;
        font-size: 0.75rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--tg-muted);
        margin-bottom: 0.35rem;
      }
      .stat .value {
        font-family: var(--tg-font-display);
        font-size: 1.65rem;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
      }
      .status {
        min-height: 1.4em;
        font-size: 0.95rem;
        color: var(--tg-muted);
      }
      .status[data-tone="ok"] { color: var(--tg-accent); }
      .status[data-tone="err"] { color: #f0a3a3; }
      .tide {
        width: 4.5rem;
        height: 4.5rem;
        margin: 0 auto 1.25rem;
        border-radius: 50%;
        border: 2px solid color-mix(in oklab, var(--tg-primary) 45%, transparent);
        position: relative;
      }
      .tide::after {
        content: "";
        position: absolute;
        inset: 18%;
        border-radius: 50%;
        background: color-mix(in oklab, var(--tg-primary) 35%, transparent);
        animation: pulse 2.4s cubic-bezier(0.16, 1, 0.3, 1) infinite;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(0.72); opacity: 0.55; }
        50% { transform: scale(1); opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .tide::after { animation: none; }
        .progress > span { transition: none; }
      }
    </style>
  </head>
  <body>
    <main>
      <p class="brand">TideGuard</p>
      <div class="tide" aria-hidden="true"></div>
      <h1>${escapeHtml(branding.title)}</h1>
      <p class="message">${escapeHtml(branding.message)}</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress">
        <span></span>
      </div>
      <div class="stats" id="stats" data-cols="${showWaitingCount ? 3 : 2}">
        <div class="stat">
          <span class="label" id="primary-label">Position</span>
          <span class="value" id="position">—</span>
        </div>
        <div class="stat">
          <span class="label">Est. wait</span>
          <span class="value" id="eta">—</span>
        </div>
        ${
          showWaitingCount
            ? `<div class="stat" id="depth-a-stat">
          <span class="label" id="depth-a-label">In pool</span>
          <span class="value" id="depth-a">—</span>
        </div>
        <div class="stat" id="depth-b-stat" hidden>
          <span class="label" id="depth-b-label">Behind</span>
          <span class="value" id="depth-b">—</span>
        </div>`
            : ""
        }
      </div>
      <p class="status" id="status" data-tone="ok">Connecting to queue…</p>
    </main>
    <script>
      (() => {
        const queue = ${JSON.stringify(queue)};
        const returnTo = ${JSON.stringify(returnTo)};
        const pollMs = ${JSON.stringify(pollIntervalMs)};
        const showWaitingCount = ${JSON.stringify(showWaitingCount)};
        const storageKey = "tg_visitor:" + queue;
        let visitorId = ${JSON.stringify(initialVisitorId)} || localStorage.getItem(storageKey) || "";
        let timer = null;
        let heartbeatTimer = null;

        const el = {
          stats: document.getElementById("stats"),
          primaryLabel: document.getElementById("primary-label"),
          position: document.getElementById("position"),
          eta: document.getElementById("eta"),
          depthAStat: document.getElementById("depth-a-stat"),
          depthALabel: document.getElementById("depth-a-label"),
          depthA: document.getElementById("depth-a"),
          depthBStat: document.getElementById("depth-b-stat"),
          depthBLabel: document.getElementById("depth-b-label"),
          depthB: document.getElementById("depth-b"),
          status: document.getElementById("status"),
          progress: document.getElementById("progress"),
        };

        function setStatus(text, tone) {
          el.status.textContent = text;
          el.status.dataset.tone = tone || "ok";
        }

        function formatEta(seconds) {
          if (!Number.isFinite(seconds) || seconds <= 0) return "now";
          if (seconds < 60) return seconds + "s";
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          return m + "m " + String(s).padStart(2, "0") + "s";
        }

        function formatOdds(odds) {
          if (!Number.isFinite(odds) || odds <= 0) return "—";
          const n = Math.max(1, Math.round(1 / odds));
          return "1 in " + n;
        }

        function updateProgress(data) {
          if (data.admissionMode === "lottery") {
            const odds = data.lotteryOdds;
            const pct = !odds ? 8 : Math.max(8, Math.min(92, Math.round(odds * 100)));
            el.progress.style.setProperty("--progress", pct + "%");
            el.progress.setAttribute("aria-valuenow", String(pct));
            return;
          }
          const position = data.position;
          if (!position || position < 1) {
            el.progress.style.setProperty("--progress", "100%");
            el.progress.setAttribute("aria-valuenow", "100");
            return;
          }
          const pct = Math.max(4, Math.min(96, Math.round(100 / Math.sqrt(position))));
          el.progress.style.setProperty("--progress", pct + "%");
          el.progress.setAttribute("aria-valuenow", String(pct));
        }

        function renderWaiting(data) {
          if (data.admissionMode === "lottery") {
            el.primaryLabel.textContent = "Lottery odds";
            el.position.textContent = formatOdds(data.lotteryOdds);
            setStatus("Lottery Mode · waiting in “" + queue + "”", "ok");
            if (showWaitingCount && el.depthA) {
              el.depthALabel.textContent = "In pool";
              el.depthA.textContent = Number.isFinite(data.waiting) ? String(data.waiting) : "—";
              if (el.depthBStat) el.depthBStat.hidden = true;
              if (el.stats) el.stats.dataset.cols = "3";
            }
          } else {
            el.primaryLabel.textContent = "Position";
            el.position.textContent = String(data.position ?? "—");
            setStatus("Queue Mode · waiting in “" + queue + "”", "ok");
            if (showWaitingCount && el.depthA) {
              const ahead = Number.isFinite(data.ahead) ? data.ahead : Math.max(0, (data.position || 1) - 1);
              const behind = Number.isFinite(data.behind)
                ? data.behind
                : Math.max(0, (data.waiting || 0) - (data.position || 0));
              el.depthALabel.textContent = "Ahead";
              el.depthA.textContent = String(ahead);
              if (el.depthBStat && el.depthB && el.depthBLabel) {
                el.depthBStat.hidden = false;
                el.depthBLabel.textContent = "Behind";
                el.depthB.textContent = String(behind);
              }
              if (el.stats) el.stats.dataset.cols = "4";
            }
          }
          el.eta.textContent = formatEta(data.estimatedWaitSeconds);
          updateProgress(data);
        }

        function admit(token) {
          const maxAge = 60 * 60;
          document.cookie = "tg_access=" + encodeURIComponent(token) + "; Path=/; Max-Age=" + maxAge + "; SameSite=Lax";
          setStatus("You’re in. Redirecting…", "ok");
          window.location.replace(returnTo + (returnTo.includes("?") ? "&" : "?") + "queue=" + encodeURIComponent(queue));
        }

        async function join() {
          const body = { queue };
          if (visitorId) body.visitorId = visitorId;
          const res = await fetch("/join", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error?.message || "Join failed");
          visitorId = data.visitorId;
          localStorage.setItem(storageKey, visitorId);
          if (data.status === "admitted" && data.accessToken) {
            admit(data.accessToken);
            return;
          }
          renderWaiting(data);
        }

        async function poll() {
          if (!visitorId) return;
          const res = await fetch("/status?queue=" + encodeURIComponent(queue) + "&id=" + encodeURIComponent(visitorId));
          const data = await res.json();
          if (!res.ok) {
            if (res.status === 404) {
              localStorage.removeItem(storageKey);
              visitorId = "";
              await join();
              return;
            }
            throw new Error(data.error?.message || "Status failed");
          }
          if (data.status === "admitted" && data.accessToken) {
            admit(data.accessToken);
            return;
          }
          renderWaiting(data);
        }

        async function heartbeat() {
          if (!visitorId) return;
          await fetch("/heartbeat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ queue, visitorId }),
          });
        }

        async function tick() {
          try {
            await poll();
          } catch (err) {
            setStatus(err.message || "Connection issue. Retrying…", "err");
          }
        }

        (async () => {
          try {
            await join();
            timer = setInterval(tick, pollMs);
            heartbeatTimer = setInterval(() => {
              heartbeat().catch(() => {});
            }, Math.max(pollMs * 4, 10000));
          } catch (err) {
            setStatus(err.message || "Could not join queue", "err");
          }
        })();

        window.addEventListener("pagehide", () => {
          if (timer) clearInterval(timer);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        });
      })();
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCss(value: string): string {
  return value.replaceAll(/[;{}]/g, "");
}
