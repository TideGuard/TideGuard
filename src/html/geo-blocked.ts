/**
 * Soft deny page when a visitor's CF-IPCountry is on the temporary block list.
 */

import { mergeBranding, type WaitingRoomBranding } from "../core/branding";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCss(value: string): string {
  return value.replaceAll(/[;{}]/g, "");
}

export function renderGeoBlockedPage(options: {
  country: string | null;
  embed?: boolean;
  branding?: Partial<WaitingRoomBranding>;
}): string {
  const country = options.country ? escapeHtml(options.country) : "your region";
  const embed = options.embed === true;
  const branding = mergeBranding(options.branding);
  const faviconLink = branding.faviconUrl
    ? `<link rel="icon" href="${escapeHtml(branding.faviconUrl)}" />`
    : "";
  const logoHtml = branding.logoUrl
    ? `<img class="logo" src="${escapeHtml(branding.logoUrl)}" alt="" width="160" height="48" />`
    : `<p class="brand">TideGuard</p>`;
  return `<!DOCTYPE html>
<html lang="en" class="${embed ? "is-embed" : ""}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Not available</title>
  ${faviconLink}
  <style>
    :root {
      --bg: ${escapeCss(branding.backgroundColor)};
      --surface: ${escapeCss(branding.surfaceColor)};
      --text: ${escapeCss(branding.textColor)};
      --muted: ${escapeCss(branding.mutedColor)};
      --accent: ${escapeCss(branding.accentColor)};
      --font: ${escapeCss(branding.fontFamily)};
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; }
    body {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 2rem 1.25rem;
      font-family: var(--font), "Source Sans 3", system-ui, sans-serif;
      background:
        radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in oklab, var(--accent) 18%, transparent), transparent),
        var(--bg);
      color: var(--text);
    }
    html.is-embed body {
      min-height: 100%;
      padding: 1rem;
      background: var(--surface);
    }
    main {
      width: min(28rem, 100%);
      background: var(--surface);
      border: 1px solid color-mix(in oklab, var(--muted) 35%, transparent);
      border-radius: 12px;
      padding: 1.75rem 1.5rem;
    }
    html.is-embed main {
      border: 0;
      padding: 0.5rem 0.25rem;
      width: 100%;
      background: transparent;
    }
    .logo {
      display: block;
      max-width: 10rem;
      max-height: 3rem;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: 0 0 0.75rem;
    }
    .brand {
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      margin: 0 0 0.75rem;
    }
    h1 {
      margin: 0 0 0.65rem;
      font-size: 1.45rem;
      font-weight: 700;
    }
    html.is-embed h1 { font-size: 1.2rem; }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }
    code {
      font-size: 0.9em;
      color: var(--text);
    }
  </style>
</head>
<body>
  <main>
    ${logoHtml}
    <h1>Not available in your region</h1>
    <p>
      Access from <code>${country}</code> is temporarily unavailable for this event.
      If you believe this is a mistake, contact the event organizer.
    </p>
  </main>
</body>
</html>`;
}

export function geoBlockedResponse(
  country: string | null,
  options: { embed?: boolean; branding?: Partial<WaitingRoomBranding> } = {},
): Response {
  return new Response(
    renderGeoBlockedPage({
      country,
      ...(options.embed !== undefined ? { embed: options.embed } : {}),
      ...(options.branding !== undefined ? { branding: options.branding } : {}),
    }),
    {
      status: 403,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

/** JSON body for custom API / widget clients that call /join directly. */
export function geoBlockedJson(country: string | null): Record<string, unknown> {
  return {
    error: {
      code: "forbidden",
      message: "Access is not available from your region",
      details: { country },
    },
  };
}
