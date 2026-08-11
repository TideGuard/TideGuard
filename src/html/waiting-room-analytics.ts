/**
 * Official GA4 gtag bootstrap when a Measurement ID is configured.
 * ID must already be sanitized (`G-…` only).
 */
export function waitingRoomAnalyticsSnippet(googleAnalyticsId: string): string {
  if (!googleAnalyticsId) {
    return "";
  }
  const id = escapeHtml(googleAnalyticsId);
  return `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${id}');
    </script>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
