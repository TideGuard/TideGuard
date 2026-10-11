import faviconPng from "../assets/brand/favicon.png";
import logoPng from "../assets/brand/logo.png";

const CACHE = "public, max-age=86400";

/**
 * Built-in TideGuard logo / favicon for waiting-room defaults and product chrome.
 * Operators override via Branding logo/favicon https URLs.
 */
export function handleBrandAsset(pathname: string): Response | null {
  if (pathname === "/brand/favicon.png") {
    return new Response(faviconPng, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": CACHE,
      },
    });
  }
  if (pathname === "/brand/logo.png") {
    return new Response(logoPng, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": CACHE,
      },
    });
  }
  return null;
}
