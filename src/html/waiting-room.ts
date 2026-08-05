import type { WaitingRoomBranding } from "../core/branding";
import { mergeBranding } from "../core/branding";
import { waitingRoomClientScript } from "./waiting-room-client";
import { waitingRoomStyles } from "./waiting-room-styles";
import {
  resolveWaitingRoomLocale,
  waitingRoomStrings,
  type WaitingRoomLocale,
} from "./waiting-room-i18n";

export interface WaitingRoomRenderOptions {
  queue: string;
  embed?: boolean;
  returnTo?: string;
  visitorId?: string;
  branding?: Partial<WaitingRoomBranding>;
  /**
   * Fixed status poll interval (ms). When set, disables adaptive `nextPollAfterMs`.
   * Not recommended — prefer adaptive (default). Floor 2000.
   */
  pollIntervalMs?: number;
  /**
   * Fixed heartbeat interval (ms). Used with fixed poll override.
   * Not recommended when status renews liveness. Floor 5000.
   */
  heartbeatIntervalMs?: number;
  /** Server heartbeat timeout; used for dedicated-heartbeat fallback. */
  heartbeatTimeoutSeconds?: number;
  /** Unix ms when admissions begin; null/undefined = already open. */
  opensAt?: number | null;
  /** BCP-47 language tag stub; only `en` is shipped today. */
  locale?: string | null;
}

/**
 * Self-contained waiting room page (full page or embeddable iframe).
 * Joins the queue in-browser, polls /status (adaptive by default), then redirects with a cookie.
 */
export function renderWaitingRoom(options: WaitingRoomRenderOptions): string {
  const branding = mergeBranding(options.branding);
  const embed = options.embed === true;
  const locale: WaitingRoomLocale = resolveWaitingRoomLocale(options.locale);
  const copy = waitingRoomStrings(locale);
  const fixedPoll =
    options.pollIntervalMs !== undefined ? Math.max(2000, options.pollIntervalMs) : null;
  const fixedHeartbeat =
    options.heartbeatIntervalMs !== undefined ? Math.max(5000, options.heartbeatIntervalMs) : null;
  const useFixedIntervals = fixedPoll !== null || fixedHeartbeat !== null;
  const pollIntervalMs = fixedPoll ?? 15_000;
  const heartbeatIntervalMs = fixedHeartbeat ?? 30_000;
  const heartbeatTimeoutSeconds = Math.max(10, options.heartbeatTimeoutSeconds ?? 180);
  const returnTo = options.returnTo ?? "/demo";
  const queue = options.queue;
  const initialVisitorId = options.visitorId ?? "";
  const showWaitingCount = branding.showWaitingCount;
  const opensAt = options.opensAt ?? null;
  const playTurnSound = branding.playTurnSound && branding.requireClickToEnter;

  const styles = waitingRoomStyles({
    backgroundColor: escapeCss(branding.backgroundColor),
    surfaceColor: escapeCss(branding.surfaceColor),
    textColor: escapeCss(branding.textColor),
    mutedColor: escapeCss(branding.mutedColor),
    primaryColor: escapeCss(branding.primaryColor),
    accentColor: escapeCss(branding.accentColor),
    fontFamily: escapeCss(branding.fontFamily),
  });

  const script = waitingRoomClientScript({
    queue,
    returnTo,
    useFixedIntervals,
    pollIntervalMs,
    heartbeatIntervalMs,
    heartbeatTimeoutMs: heartbeatTimeoutSeconds * 1000,
    showWaitingCount,
    requireClickToEnter: branding.requireClickToEnter,
    playTurnSound,
    opensAt,
    initialVisitorId,
  });

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}" class="${embed ? "is-embed" : ""}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(branding.title)} · TideGuard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
    <style>${styles}</style>
  </head>
  <body>
    <main>
      <p class="brand">${escapeHtml(copy.brand)}</p>
      <div class="tide" aria-hidden="true"></div>
      <h1>${escapeHtml(branding.title)}</h1>
      <p class="message">${escapeHtml(branding.message)}</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Queue progress" id="progress">
        <span></span>
      </div>
      <div class="stats" id="stats" data-cols="${showWaitingCount ? 3 : 2}" aria-live="polite">
        <div class="stat">
          <span class="label" id="primary-label">${escapeHtml(copy.positionLabel)}</span>
          <span class="value" id="position">—</span>
        </div>
        <div class="stat">
          <span class="label">${escapeHtml(copy.waitLabel)}</span>
          <span class="value" id="eta">—</span>
        </div>
        <div class="stat" id="checkin-stat">
          <span class="label">${escapeHtml(copy.checkInLabel)}</span>
          <span class="value" id="checkin">—</span>
        </div>
        ${
          showWaitingCount
            ? `<div class="stat" id="depth-a-stat">
          <span class="label" id="depth-a-label">${escapeHtml(copy.depthLabel)}</span>
          <span class="value" id="depth-a">—</span>
        </div>
        <div class="stat" id="depth-b-stat" hidden>
          <span class="label" id="depth-b-label">Behind</span>
          <span class="value" id="depth-b">—</span>
        </div>`
            : ""
        }
      </div>
      <p class="status" id="status" data-tone="ok" role="status" aria-live="polite">Connecting to queue…</p>
      <p class="hint" id="checkin-hint" hidden></p>
      <p class="status" id="open-status" data-tone="ok" role="status" aria-live="polite" hidden></p>
      <div class="enter-panel" id="enter-panel" hidden>
        <p class="hold" id="hold-text">${escapeHtml(copy.statusHold)}</p>
        <button type="button" id="enter-btn">${escapeHtml(branding.enterButtonLabel)}</button>
      </div>
      <label class="sound-opt" id="sound-opt" ${playTurnSound ? "" : "hidden"}>
        <input type="checkbox" id="sound-toggle" />
        ${escapeHtml(copy.soundLabel)}
      </label>
    </main>
    ${
      embed
        ? `<script>
      (function () {
        function postHeight() {
          var h = Math.ceil(document.documentElement.scrollHeight);
          try { parent.postMessage({ type: "tideguard-embed-height", height: h }, "*"); } catch (e) {}
        }
        postHeight();
        if (typeof ResizeObserver !== "undefined") {
          new ResizeObserver(postHeight).observe(document.body);
        }
        window.addEventListener("load", postHeight);
      })();
    </script>`
        : ""
    }
    ${script}
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
