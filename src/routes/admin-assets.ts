/**
 * Serve the Vite-built React admin SPA from Workers Static Assets.
 * Browser paths are under `/admin/…`; the asset binding is rooted at `dist/admin`.
 *
 * Note: Workers Static Assets often 302 `/index.html` → `/`. Always request `/`
 * for the SPA shell so we never leak that redirect to the browser (it would
 * bounce with the unfinished-setup `/` → `/admin` redirect).
 */
export async function serveAdminAssets(request: Request, env: Env): Promise<Response | null> {
  if (!env.ASSETS) {
    return null;
  }

  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) {
    return null;
  }

  if (pathname.startsWith("/api/")) {
    return null;
  }

  let assetPath: string;
  if (pathname === "/admin" || pathname === "/admin/") {
    assetPath = "/";
  } else if (pathname.startsWith("/admin/")) {
    assetPath = pathname.slice("/admin".length);
    if (!assetPath.startsWith("/")) {
      assetPath = `/${assetPath}`;
    }
    if (assetPath === "/index.html") {
      assetPath = "/";
    }
  } else {
    return null;
  }

  const assetUrl = new URL(assetPath, url.origin);
  let response = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));

  // Internal follow if the platform still redirects index → /
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      const next = new URL(location, url.origin);
      if (next.pathname === "/" || next.pathname === "/index.html") {
        response = await env.ASSETS.fetch(
          new Request(new URL("/", url.origin).toString(), request),
        );
      }
    }
  }

  // SPA fallback for client routes under /admin/
  if (response.status === 404 && request.method === "GET" && !assetPath.includes(".")) {
    response = await env.ASSETS.fetch(new Request(new URL("/", url.origin).toString(), request));
  }

  if (response.status === 404 || (response.status >= 300 && response.status < 400)) {
    return null;
  }

  const headers = new Headers(response.headers);
  if (assetPath === "/" || assetPath === "/index.html") {
    headers.set("cache-control", "no-store");
    headers.set("content-type", "text/html; charset=utf-8");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
