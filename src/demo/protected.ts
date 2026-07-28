/**
 * Demo protected site shown after admission.
 */

export function renderProtectedDemo(options: { queueName: string; visitorId: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Access granted · TideGuard</title>
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
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
        font-family: "Source Sans 3", "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at 20% 0%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 45%),
          linear-gradient(165deg, var(--bg), var(--surface));
      }
      main { width: min(100%, 32rem); }
      .eyebrow {
        margin: 0 0 0.75rem;
        font-size: 0.85rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
      }
      h1 {
        margin: 0 0 0.75rem;
        font-family: "Fraunces", Georgia, serif;
        font-size: clamp(2.2rem, 5vw, 3rem);
        font-weight: 650;
        letter-spacing: -0.02em;
        text-wrap: balance;
      }
      p {
        margin: 0 0 0.75rem;
        line-height: 1.6;
        color: var(--muted);
        max-width: 40ch;
      }
      code {
        font-size: 0.9em;
        color: var(--text);
      }
      a { color: var(--accent); }
      .actions { margin-top: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Protected demo</p>
      <h1>Access granted</h1>
      <p>
        You were admitted from queue <code>${escapeHtml(options.queueName)}</code>
        as visitor <code>${escapeHtml(options.visitorId)}</code>.
      </p>
      <p>This page is only reachable with a valid TideGuard admission token.</p>
      <div class="actions">
        <a href="/">Home</a>
        <a href="/metrics?queue=${encodeURIComponent(options.queueName)}">Queue metrics</a>
      </div>
    </main>
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
