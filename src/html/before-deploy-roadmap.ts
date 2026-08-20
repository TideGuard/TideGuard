/**
 * Simple visual “before you deploy” roadmap for operators.
 * Served at /before-you-deploy; downloadable via /before-you-deploy/download.
 */

export type BeforeDeployRoadmapOptions = {
  /** When true, omit site nav links that require tideguard.dev (standalone download). */
  standalone?: boolean;
};

const DEPLOY_URL =
  "https://deploy.workers.cloudflare.com/?url=https://github.com/TideGuard/TideGuard";

const STEPS = [
  {
    phase: "Deploy",
    items: [
      {
        n: 1,
        title: "Generate a secret",
        body: "Create TOKEN_SECRET — you will paste it twice: once at deploy, once when you claim /admin.",
        link: "https://tideguard.dev/token",
        linkLabel: "Generate at tideguard.dev/token",
      },
      {
        n: 2,
        title: "Deploy to Cloudflare",
        body: "Use Deploy to Cloudflare or Wrangler. Only TOKEN_SECRET is prompted — queue, origin, and Turnstile are set in /admin later.",
        link: DEPLOY_URL,
        linkLabel: "Deploy to Cloudflare",
      },
      {
        n: 3,
        title: "Claim the control room",
        body: "Open /admin, paste TOKEN_SECRET, choose username + password, and save the 12-word recovery phrase (shown once).",
        link: "https://tideguard.dev/docs/getting-started/",
        linkLabel: "Getting started guide",
      },
    ],
  },
  {
    phase: "Setup wizard",
    items: [
      {
        n: 4,
        title: "Connect Cloudflare",
        body: "Paste API token → verify → zone & hostname → SSL → attach domain. All from TideGuard — not the dashboard.",
        link: "https://tideguard.dev/docs/admin/",
        linkLabel: "Admin guide",
      },
      {
        n: 5,
        title: "Turnstile + queue",
        body: "Protect admin login with Turnstile. Pick queue mode and branding, then Finish.",
        link: "https://tideguard.dev/docs/admin/",
        linkLabel: "Admin guide",
      },
    ],
  },
  {
    phase: "Go live",
    items: [
      {
        n: 6,
        title: "Demo mode first",
        body: "Origin stays ungated. Smoke-test /demo and /wait?return=/demo in an incognito window.",
        link: "https://tideguard.dev/docs/protecting-origin/",
        linkLabel: "Protecting origin",
      },
      {
        n: 7,
        title: "Go live",
        body: "Set origin URL and enable protect-all (or path prefixes). Unauthenticated traffic → waiting room; admitted → your site.",
        link: "https://tideguard.dev/docs/protecting-origin/",
        linkLabel: "Origin proxy",
      },
      {
        n: 8,
        title: "Launch checklist",
        body: "Capacity, SSL, webhooks, schedules — walk the checklist before real traffic.",
        link: "https://tideguard.dev/docs/launch-checklist/",
        linkLabel: "Launch checklist",
      },
    ],
  },
] as const;

function stepHtml(step: (typeof STEPS)[number]["items"][number]): string {
  const link = step.link
    ? `<a class="step-link" href="${step.link}">${step.linkLabel ?? "Learn more"}</a>`
    : "";
  return `<li class="step">
      <div class="step-marker" aria-hidden="true">${step.n}</div>
      <div class="step-body">
        <h3>${step.title}</h3>
        <p>${step.body}</p>
        ${link}
      </div>
    </li>`;
}

function phasesHtml(): string {
  return STEPS.map(
    (phase) => `<section class="phase">
      <h2 class="phase-label">${phase.phase}</h2>
      <ol class="timeline">${phase.items.map(stepHtml).join("")}</ol>
    </section>`,
  ).join("");
}

function navHtml(standalone: boolean): string {
  if (standalone) {
    return `<nav class="site-nav" aria-label="TideGuard">
      <a href="https://tideguard.dev">tideguard.dev</a>
      <a href="https://tideguard.dev/docs/">Docs</a>
      <span class="nav-current" aria-current="page">Before you deploy</span>
      <a class="nav-deploy" href="${DEPLOY_URL}">Deploy</a>
    </nav>`;
  }
  return `<nav class="site-nav" aria-label="TideGuard">
      <a href="https://tideguard.dev">tideguard.dev</a>
      <a href="https://tideguard.dev/docs/">Docs</a>
      <span class="nav-current" aria-current="page">Before you deploy</span>
      <a class="nav-deploy" href="${DEPLOY_URL}">Deploy</a>
    </nav>`;
}

export function renderBeforeDeployRoadmapPage(options: BeforeDeployRoadmapOptions = {}): string {
  const standalone = options.standalone ?? false;
  const downloadHref = standalone ? "#" : "/before-you-deploy/download";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Before you deploy · TideGuard</title>
    <meta name="description" content="Simple visual roadmap: what to do before pointing production traffic at TideGuard." />
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
      a { color: var(--accent-2); text-decoration: none; }
      a:hover { text-decoration: underline; }
      .wrap {
        width: min(100% - 2rem, 42rem);
        margin: 0 auto;
        padding: 1.5rem 0 3rem;
      }
      .header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-bottom: 2rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--line);
      }
      .site-nav {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem 1rem;
        font-size: 0.92rem;
      }
      .nav-current {
        color: var(--text);
        font-weight: 600;
      }
      .nav-deploy {
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        border: 1px solid color-mix(in oklab, var(--accent) 55%, transparent);
        background: color-mix(in oklab, var(--accent) 12%, transparent);
        color: var(--accent-2);
        font-weight: 600;
        text-decoration: none;
      }
      .nav-deploy:hover { text-decoration: none; border-color: var(--accent); }
      .download-btn {
        font: inherit;
        font-size: 0.88rem;
        font-weight: 600;
        padding: 0.4rem 0.85rem;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
      }
      .download-btn:hover {
        color: var(--accent-2);
        border-color: color-mix(in oklab, var(--accent) 50%, transparent);
        text-decoration: none;
      }
      h1 {
        margin: 0 0 0.5rem;
        font-family: "Fraunces", Georgia, serif;
        font-weight: 650;
        font-size: clamp(1.85rem, 5vw, 2.5rem);
        letter-spacing: -0.02em;
        text-wrap: balance;
      }
      .lede {
        margin: 0 0 2rem;
        color: var(--muted);
        line-height: 1.55;
        max-width: 38ch;
        text-wrap: pretty;
      }
      .phase { margin-bottom: 2rem; }
      .phase-label {
        margin: 0 0 1rem;
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .timeline {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0;
      }
      .step {
        display: grid;
        grid-template-columns: 2.5rem 1fr;
        gap: 0 1rem;
        padding-bottom: 1.35rem;
        position: relative;
      }
      .step:not(:last-child)::before {
        content: "";
        position: absolute;
        left: 1.15rem;
        top: 2.4rem;
        bottom: 0;
        width: 2px;
        background: var(--line);
      }
      .step-marker {
        width: 2.3rem;
        height: 2.3rem;
        border-radius: 50%;
        display: grid;
        place-items: center;
        font-weight: 600;
        font-size: 0.95rem;
        background: color-mix(in oklab, var(--accent) 18%, var(--surface));
        border: 2px solid color-mix(in oklab, var(--accent) 45%, transparent);
        color: var(--accent-2);
        z-index: 1;
      }
      .step-body h3 {
        margin: 0 0 0.35rem;
        font-family: "Fraunces", Georgia, serif;
        font-size: 1.1rem;
        font-weight: 550;
      }
      .step-body p {
        margin: 0 0 0.4rem;
        color: var(--muted);
        font-size: 0.94rem;
        line-height: 1.5;
      }
      .step-link { font-size: 0.88rem; font-weight: 600; }
      .footer {
        margin-top: 1rem;
        padding-top: 1.25rem;
        border-top: 1px solid var(--line);
        font-size: 0.85rem;
        color: var(--muted);
        line-height: 1.5;
      }
      @media print {
        body { background: white; color: #111; }
        .download-btn, .site-nav .nav-deploy { display: none; }
        a { color: #0d6b64; }
        .step-marker {
          background: #e8f6f4;
          border-color: #2bb0a6;
          color: #0d6b64;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="header">
        ${navHtml(standalone)}
        <a class="download-btn" href="${downloadHref}"${standalone ? ' onclick="window.print(); return false;"' : ""}>Download / print</a>
      </header>
      <h1>Before you deploy</h1>
      <p class="lede">
        Eight steps from zero to production. Most settings live in <strong>/admin</strong> after deploy — not in Wrangler prompts.
      </p>
      ${phasesHtml()}
      <p class="footer">
        TideGuard · open-source waiting room for Cloudflare Workers.
        Full guides at <a href="https://tideguard.dev/docs/">tideguard.dev/docs</a>.
        ${standalone ? "" : 'Save offline: <a href="/before-you-deploy/download">Download HTML</a>.'}
      </p>
    </div>
  </body>
</html>`;
}
