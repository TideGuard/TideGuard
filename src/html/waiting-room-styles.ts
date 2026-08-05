export interface WaitingRoomStyleVars {
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedColor: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
}

/**
 * Waiting-room page CSS. Color/font values must already be CSS-safe (escapeCss).
 */
export function waitingRoomStyles(vars: WaitingRoomStyleVars): string {
  return `
      :root {
        --tg-bg: ${vars.backgroundColor};
        --tg-surface: ${vars.surfaceColor};
        --tg-text: ${vars.textColor};
        --tg-muted: ${vars.mutedColor};
        --tg-primary: ${vars.primaryColor};
        --tg-accent: ${vars.accentColor};
        --tg-font-display: ${vars.fontFamily};
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
        padding: 0.75rem 1rem 1rem;
        background: var(--tg-surface);
      }
      html.is-embed main {
        width: min(100%, 24rem);
      }
      html.is-embed .tide {
        display: none;
      }
      html.is-embed h1 {
        font-size: clamp(1.5rem, 5vw, 2rem);
      }
      html.is-embed .message {
        margin-bottom: 1rem;
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
      .stats[data-cols="5"] {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      @media (min-width: 420px) {
        .stats[data-cols="4"] {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .stats[data-cols="5"] {
          grid-template-columns: repeat(3, minmax(0, 1fr));
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
      .hint {
        margin: 0.35rem 0 0;
        font-size: 0.85rem;
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
      .enter-panel[hidden] { display: none; }
      .enter-panel {
        margin-top: 1.25rem;
        padding-top: 1.25rem;
        border-top: 1px solid color-mix(in oklab, var(--tg-text) 14%, transparent);
      }
      .enter-panel .hold {
        font-size: 0.9rem;
        color: var(--tg-muted);
        margin: 0 0 1rem;
      }
      .enter-panel button {
        appearance: none;
        border: 0;
        border-radius: 0.55rem;
        padding: 0.85rem 1.4rem;
        font: inherit;
        font-weight: 600;
        color: #041015;
        background: linear-gradient(135deg, var(--tg-primary), var(--tg-accent));
        cursor: pointer;
        min-width: 12rem;
      }
      .enter-panel button:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      .sound-opt {
        margin-top: 1.1rem;
        display: flex;
        align-items: center;
        gap: 0.55rem;
        font-size: 0.88rem;
        color: var(--tg-muted);
      }
      .sound-opt[hidden] { display: none; }
      .sound-opt input {
        width: 1rem;
        height: 1rem;
        accent-color: var(--tg-accent);
      }
    `;
}
