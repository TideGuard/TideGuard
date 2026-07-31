export interface WaitingRoomClientConfig {
  queue: string;
  returnTo: string;
  useFixedIntervals: boolean;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  /** Heartbeat timeout in milliseconds (server timeout × 1000). */
  heartbeatTimeoutMs: number;
  showWaitingCount: boolean;
  requireClickToEnter: boolean;
  playTurnSound: boolean;
  opensAt: number | null;
  initialVisitorId: string;
}

/**
 * Waiting-room browser script as a `<script>` block.
 * Config values are injected via JSON.stringify for safe embedding.
 */
export function waitingRoomClientScript(config: WaitingRoomClientConfig): string {
  return `<script>
      (() => {
        const queue = ${JSON.stringify(config.queue)};
        const returnTo = ${JSON.stringify(config.returnTo)};
        const useFixedIntervals = ${JSON.stringify(config.useFixedIntervals)};
        const pollMs = ${JSON.stringify(config.pollIntervalMs)};
        const heartbeatMs = ${JSON.stringify(config.heartbeatIntervalMs)};
        const heartbeatTimeoutMs = ${JSON.stringify(config.heartbeatTimeoutMs)};
        const showWaitingCount = ${JSON.stringify(config.showWaitingCount)};
        const requireClickToEnter = ${JSON.stringify(config.requireClickToEnter)};
        const playTurnSound = ${JSON.stringify(config.playTurnSound)};
        const opensAt = ${JSON.stringify(config.opensAt)};
        const storageKey = "tg_visitor:" + queue;
        const soundPrefKey = "tg_turn_sound:" + queue;
        const turnSoundUrl = "/sounds/notification.mp3";
        let visitorId = ${JSON.stringify(config.initialVisitorId)} || localStorage.getItem(storageKey) || "";
        let timer = null;
        let heartbeatTimer = null;
        let holdTimer = null;
        let openTimer = null;
        let entering = false;
        let turnSoundPlayed = false;
        let turnAudio = null;
        let lastPollHintMs = pollMs;
        let stopped = false;

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
          openStatus: document.getElementById("open-status"),
          progress: document.getElementById("progress"),
          enterPanel: document.getElementById("enter-panel"),
          holdText: document.getElementById("hold-text"),
          enterBtn: document.getElementById("enter-btn"),
          soundToggle: document.getElementById("sound-toggle"),
        };

        if (playTurnSound && el.soundToggle) {
          el.soundToggle.checked = localStorage.getItem(soundPrefKey) !== "0";
        }

        function ensureTurnAudio() {
          if (!turnAudio) {
            turnAudio = new Audio(turnSoundUrl);
            turnAudio.preload = "auto";
          }
          return turnAudio;
        }

        function unlockTurnSound() {
          if (!playTurnSound) return;
          const audio = ensureTurnAudio();
          const p = audio.play();
          if (p && typeof p.then === "function") {
            p.then(() => {
              audio.pause();
              audio.currentTime = 0;
            }).catch(() => {});
          }
        }

        function playTurnSoundOnce() {
          if (!playTurnSound || turnSoundPlayed) return;
          if (el.soundToggle && !el.soundToggle.checked) return;
          turnSoundPlayed = true;
          try {
            const audio = ensureTurnAudio();
            audio.currentTime = 0;
            const p = audio.play();
            if (p && typeof p.catch === "function") p.catch(() => {});
          } catch (_) {}
        }

        function paintOpenCountdown() {
          if (!opensAt || !el.openStatus) return;
          const remaining = Math.max(0, Math.ceil((opensAt - Date.now()) / 1000));
          if (remaining <= 0) {
            el.openStatus.hidden = true;
            if (openTimer) { clearInterval(openTimer); openTimer = null; }
            return;
          }
          el.openStatus.hidden = false;
          const mins = Math.floor(remaining / 60);
          const secs = remaining % 60;
          const when = new Date(opensAt).toLocaleString();
          el.openStatus.textContent = mins > 0
            ? ("Opens in " + mins + "m " + String(secs).padStart(2, "0") + "s · " + when)
            : ("Opens in " + secs + "s · " + when);
        }

        if (opensAt && opensAt > Date.now()) {
          paintOpenCountdown();
          openTimer = setInterval(paintOpenCountdown, 1000);
        }

        function setStatus(text, tone) {
          el.status.textContent = text;
          el.status.dataset.tone = tone || "ok";
        }

        function showGeoBlocked(country) {
          stopPolling();
          if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
          el.enterPanel.hidden = true;
          el.progress.hidden = true;
          if (el.stats) el.stats.hidden = true;
          el.primaryLabel.textContent = "Region";
          el.position.textContent = country || "—";
          el.eta.textContent = "—";
          setStatus(
            country
              ? ("Not available in your region (" + country + "). This event is temporarily geo-restricted.")
              : "Not available in your region. This event is temporarily geo-restricted.",
            "err",
          );
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

        function redirectNow() {
          setStatus("You’re in. Redirecting…", "ok");
          stopPolling();
          window.location.replace(returnTo + (returnTo.includes("?") ? "&" : "?") + "queue=" + encodeURIComponent(queue));
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
          el.enterPanel.hidden = true;
          if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
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
          notePollHint(data);
        }

        function notePollHint(data) {
          if (useFixedIntervals) return;
          const hint = Number(data.nextPollAfterMs);
          if (Number.isFinite(hint) && hint >= 2000) {
            lastPollHintMs = hint;
          }
        }

        function showEnterPanel(data) {
          const firstShow = el.enterPanel.hidden;
          el.enterPanel.hidden = false;
          el.progress.style.setProperty("--progress", "100%");
          setStatus("You’re next — confirm to enter", "ok");
          if (firstShow) playTurnSoundOnce();
          let remaining = Number.isFinite(data.holdSecondsRemaining)
            ? data.holdSecondsRemaining
            : 0;
          const paint = () => {
            el.holdText.textContent = remaining > 0
              ? ("Your spot is held for " + remaining + "s. Click to continue.")
              : "Your hold is ending…";
          };
          paint();
          if (holdTimer) clearInterval(holdTimer);
          holdTimer = setInterval(async () => {
            remaining -= 1;
            paint();
            if (remaining <= 0) {
              clearInterval(holdTimer);
              holdTimer = null;
              await forfeitHold();
            }
          }, 1000);
        }

        async function forfeitHold() {
          el.enterPanel.hidden = true;
          turnSoundPlayed = false;
          setStatus("Hold expired. Rejoining the line…", "err");
          try {
            await fetch("/leave", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ queue, visitorId }),
            });
          } catch (_) {}
          localStorage.removeItem(storageKey);
          visitorId = "";
          await join();
        }

        async function confirmEnter() {
          if (entering || !visitorId) return;
          entering = true;
          el.enterBtn.disabled = true;
          try {
            const res = await fetch("/enter", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ queue, visitorId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || "Could not enter");
            if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
            redirectNow();
          } catch (err) {
            entering = false;
            el.enterBtn.disabled = false;
            setStatus(err.message || "Could not enter", "err");
          }
        }

        async function handleAdmitted(data) {
          if (data.entered && data.accessToken) {
            redirectNow();
            return;
          }
          if (requireClickToEnter || data.entered === false) {
            showEnterPanel(data);
            return;
          }
          redirectNow();
        }

        async function join() {
          const body = { queue };
          if (visitorId) body.visitorId = visitorId;
          const res = await fetch("/join", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) {
            if (res.status === 403 && data.error?.code === "forbidden") {
              const country = data.error?.details?.country;
              showGeoBlocked(country);
              return;
            }
            throw new Error(data.error?.message || "Join failed");
          }
          visitorId = data.visitorId;
          localStorage.setItem(storageKey, visitorId);
          if (data.status === "admitted") {
            await handleAdmitted(data);
            return;
          }
          renderWaiting(data);
        }

        async function poll() {
          if (!visitorId || entering) return;
          if (!el.enterPanel.hidden) {
            // Still poll so an expired hold becomes 404 / rejoin.
          }
          const res = await fetch(
            "/status?queue=" + encodeURIComponent(queue) + "&id=" + encodeURIComponent(visitorId),
            { credentials: "same-origin" },
          );
          const data = await res.json();
          if (!res.ok) {
            if (res.status === 404) {
              el.enterPanel.hidden = true;
              turnSoundPlayed = false;
              if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
              localStorage.removeItem(storageKey);
              visitorId = "";
              await join();
              return;
            }
            throw new Error(data.error?.message || "Status failed");
          }
          if (data.status === "admitted") {
            await handleAdmitted(data);
            return;
          }
          renderWaiting(data);
        }

        async function heartbeat() {
          if (!visitorId || !el.enterPanel.hidden) return;
          await fetch("/heartbeat", {
            method: "POST",
            credentials: "same-origin",
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

        function clearPollTimer() {
          if (timer) {
            clearTimeout(timer);
            clearInterval(timer);
            timer = null;
          }
        }

        function clearHeartbeatTimer() {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        }

        function stopPolling() {
          stopped = true;
          clearPollTimer();
          clearHeartbeatTimer();
        }

        function needsDedicatedHeartbeat(intervalMs) {
          return intervalMs > heartbeatTimeoutMs * 0.5;
        }

        function syncHeartbeatFallback(intervalMs) {
          clearHeartbeatTimer();
          if (!needsDedicatedHeartbeat(intervalMs)) return;
          heartbeatTimer = setInterval(() => {
            heartbeat().catch(() => {});
          }, Math.max(5000, Math.floor(heartbeatTimeoutMs * 0.4)));
        }

        function scheduleAdaptive() {
          if (stopped || useFixedIntervals) return;
          clearPollTimer();
          const delay = Math.max(2000, lastPollHintMs || pollMs);
          syncHeartbeatFallback(delay);
          timer = setTimeout(async () => {
            await tick();
            scheduleAdaptive();
          }, delay);
        }

        function startFixed() {
          clearPollTimer();
          clearHeartbeatTimer();
          timer = setInterval(tick, pollMs);
          heartbeatTimer = setInterval(() => {
            heartbeat().catch(() => {});
          }, heartbeatMs);
        }

        el.enterBtn.addEventListener("click", () => { confirmEnter(); });

        if (playTurnSound && el.soundToggle) {
          el.soundToggle.addEventListener("change", () => {
            localStorage.setItem(soundPrefKey, el.soundToggle.checked ? "1" : "0");
            if (el.soundToggle.checked) unlockTurnSound();
          });
          if (el.soundToggle.checked) {
            const unlock = () => {
              unlockTurnSound();
              window.removeEventListener("pointerdown", unlock);
              window.removeEventListener("keydown", unlock);
            };
            window.addEventListener("pointerdown", unlock, { once: true });
            window.addEventListener("keydown", unlock, { once: true });
          }
        }

        (async () => {
          try {
            await join();
            if (stopped) return;
            if (useFixedIntervals) {
              startFixed();
            } else {
              scheduleAdaptive();
            }
          } catch (err) {
            setStatus(err.message || "Could not join queue", "err");
          }
        })();

        window.addEventListener("pagehide", () => {
          stopPolling();
          if (holdTimer) clearInterval(holdTimer);
          if (openTimer) clearInterval(openTimer);
        });
      })();
    </script>`;
}
