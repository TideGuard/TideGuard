import { ApiError, jsonError } from "../core/errors";
import { isTideGuardPath, shouldProxyToOrigin, shouldRequireAdmission } from "../core/origin";
import { resolveOriginConfig } from "../admin/origin-store";
import { requireAdmission, withSecurityHeaders } from "../auth";
import { proxyToOrigin } from "../proxy/origin-proxy";
import {
  handleAdminAdmit,
  handleAdminBootstrap,
  handleAdminCapacity,
  handleAdminDefaultQueue,
  handleAdminHealth,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminPage,
  handleAdminPassword,
  handleAdminPause,
  handleAdminReset,
  handleAdminSaveBranding,
  handleAdminSaveOrigin,
  handleAdminSchedule,
  handleAdminSetMode,
  handleAdminSetup,
  handleAdminState,
} from "./admin";
import { handleCostEstimateApi, handleCostPage } from "./cost";
import { handleHealth } from "./health";
import { OPENAPI_DOCUMENT, OPENAPI_YAML } from "./openapi";
import { handleDemo, handleWaitingRoom } from "./pages";
import {
  handleAdmit,
  handleEnter,
  handleHeartbeat,
  handleJoin,
  handleLeave,
  handleMetrics,
  handleMode,
  handlePause,
  handleStatus,
} from "./queue";

/**
 * Paths that never need origin proxy config (skip KV / cache lookup).
 * `/` is excluded because origin-enabled Workers proxy the homepage.
 */
const STATIC_TIDEGUARD = new Set([
  "/health",
  "/wait",
  "/join",
  "/status",
  "/leave",
  "/heartbeat",
  "/enter",
  "/admit",
  "/mode",
  "/pause",
  "/metrics",
  "/admin",
  "/cost",
  "/demo",
  "/api/cost-estimate",
  "/openapi.yaml",
  "/openapi.json",
]);

/**
 * HTTP router for the TideGuard Worker.
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  try {
    if (isStaticTideGuardPath(url.pathname)) {
      return withSecurityHeaders(await handleTideGuardRoute(request, env, url));
    }

    const originConfig = await resolveOriginConfig(env);
    const tideguardPath = isTideGuardPath(url.pathname, originConfig.enabled);

    if (tideguardPath) {
      return withSecurityHeaders(await handleTideGuardRoute(request, env, url));
    }

    if (shouldProxyToOrigin(url.pathname, originConfig)) {
      if (shouldRequireAdmission(url.pathname, originConfig)) {
        try {
          const admission = await requireAdmission(request, env, originConfig.queue);
          return withSecurityHeaders(
            await proxyToOrigin(request, originConfig, {
              visitorId: admission.visitorId,
            }),
          );
        } catch (error) {
          if (error instanceof ApiError && error.code === "unauthorized") {
            const wait = new URL("/wait", url.origin);
            wait.searchParams.set("queue", originConfig.queue);
            wait.searchParams.set("return", `${url.pathname}${url.search}`);
            return withSecurityHeaders(Response.redirect(wait.toString(), 302));
          }
          throw error;
        }
      }

      return withSecurityHeaders(await proxyToOrigin(request, originConfig));
    }

    throw new ApiError("not_found", `No route for ${request.method} ${url.pathname}`, 404);
  } catch (error) {
    if (error instanceof ApiError) {
      return withSecurityHeaders(jsonError(error));
    }

    console.error("Unhandled error", error);
    return withSecurityHeaders(
      jsonError(new ApiError("internal_error", "Unexpected server error", 500)),
    );
  }
}

function isStaticTideGuardPath(pathname: string): boolean {
  if (STATIC_TIDEGUARD.has(pathname)) {
    return true;
  }
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

async function handleTideGuardRoute(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "HEAD") {
    const getRequest = new Request(request.url, {
      method: "GET",
      headers: request.headers,
    });
    const response = await handleTideGuardRoute(getRequest, env, url);
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return handleHealth(env);
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/openapi.yaml" || url.pathname === "/openapi.json")
  ) {
    return handleOpenApi(url.pathname);
  }

  if (request.method === "GET" && url.pathname === "/") {
    return new Response(landingPage(), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/cost") {
    return handleCostPage();
  }

  if (request.method === "GET" && url.pathname === "/api/cost-estimate") {
    return handleCostEstimateApi(request);
  }

  if (request.method === "GET" && url.pathname === "/admin") {
    return await handleAdminPage(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/bootstrap") {
    return await handleAdminBootstrap(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/setup") {
    return await handleAdminSetup(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    return await handleAdminLogin(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    return await handleAdminLogout(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/state") {
    return await handleAdminState(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/branding") {
    return await handleAdminSaveBranding(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/origin") {
    return await handleAdminSaveOrigin(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/mode") {
    return await handleAdminSetMode(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/pause") {
    return await handleAdminPause(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/schedule") {
    return await handleAdminSchedule(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/health") {
    return await handleAdminHealth(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/reset") {
    return await handleAdminReset(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/admit") {
    return await handleAdminAdmit(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/capacity") {
    return await handleAdminCapacity(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/password") {
    return await handleAdminPassword(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/default-queue") {
    return await handleAdminDefaultQueue(request, env);
  }

  if (request.method === "GET" && url.pathname === "/wait") {
    return await handleWaitingRoom(request, env);
  }

  if (request.method === "GET" && url.pathname === "/demo") {
    return await handleDemo(request, env);
  }

  if (request.method === "POST" && url.pathname === "/join") {
    return await handleJoin(request, env);
  }

  if (request.method === "GET" && url.pathname === "/status") {
    return await handleStatus(request, env);
  }

  if (request.method === "POST" && url.pathname === "/leave") {
    return await handleLeave(request, env);
  }

  if (request.method === "POST" && url.pathname === "/heartbeat") {
    return await handleHeartbeat(request, env);
  }

  if (request.method === "POST" && url.pathname === "/enter") {
    return await handleEnter(request, env);
  }

  if (request.method === "POST" && url.pathname === "/admit") {
    return await handleAdmit(request, env);
  }

  if (request.method === "POST" && url.pathname === "/mode") {
    return await handleMode(request, env);
  }

  if (request.method === "POST" && url.pathname === "/pause") {
    return await handlePause(request, env);
  }

  if (request.method === "GET" && url.pathname === "/metrics") {
    return await handleMetrics(request, env);
  }

  throw new ApiError("not_found", `No route for ${request.method} ${url.pathname}`, 404);
}

function landingPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TideGuard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,650&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #07151c;
        --fg: #e8f1f5;
        --accent: #2bb0a6;
        --muted: #8aa4b0;
        --surface: #0b1f2a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Source Sans 3", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, #16384a 0%, transparent 45%),
          linear-gradient(160deg, #07151c, #0b1f2a 55%, #123041);
        color: var(--fg);
        padding: 2rem 1.25rem 3rem;
      }
      main { max-width: 40rem; margin: 0 auto; }
      h1 {
        font-family: "Fraunces", Georgia, serif;
        font-weight: 650;
        font-size: clamp(2.4rem, 6vw, 3.4rem);
        margin: 0 0 0.75rem;
        letter-spacing: -0.02em;
        text-wrap: balance;
      }
      h2 {
        font-family: "Fraunces", Georgia, serif;
        font-weight: 650;
        font-size: 1.25rem;
        margin: 2rem 0 0.6rem;
      }
      p, li {
        margin: 0;
        line-height: 1.6;
        color: var(--muted);
        text-wrap: pretty;
      }
      a { color: var(--accent); }
      .lead { margin-bottom: 1.25rem; }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin: 1.25rem 0 0.25rem;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.65rem 1.1rem;
        border-radius: 0.55rem;
        text-decoration: none;
        font-weight: 600;
        border: 1px solid transparent;
      }
      .btn-primary {
        background: var(--accent);
        color: #042028;
      }
      .btn-ghost {
        border-color: color-mix(in oklab, var(--muted) 45%, transparent);
        color: var(--fg);
      }
      ol {
        margin: 0.5rem 0 0;
        padding-left: 1.2rem;
        display: grid;
        gap: 0.55rem;
      }
      li strong { color: var(--fg); font-weight: 600; }
      .meta {
        margin-top: 2rem;
        font-size: 0.95rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1.1rem;
      }
      @media (prefers-reduced-motion: no-preference) {
        h1 { animation: rise 700ms ease both; }
        .lead { animation: rise 700ms ease 80ms both; }
        .actions { animation: rise 700ms ease 140ms both; }
      }
      @keyframes rise {
        from { opacity: 0; transform: translateY(0.4rem); }
        to { opacity: 1; transform: none; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>TideGuard</h1>
      <p class="lead">
        Open-source waiting room for Cloudflare Workers. Hold the flood at the edge,
        then admit people at a rate your origin can survive.
      </p>
      <div class="actions">
        <a class="btn btn-primary" href="/demo">Try the demo</a>
        <a class="btn btn-ghost" href="/admin">Open admin</a>
        <a class="btn btn-ghost" href="https://deploy.workers.cloudflare.com/?url=https://github.com/TideGuard/TideGuard">Deploy</a>
      </div>
      <h2>How it works</h2>
      <ol>
        <li><strong>Join</strong> — visitors enter a FIFO line or lottery pool.</li>
        <li><strong>Wait</strong> — heartbeats keep abandoned tabs from holding seats.</li>
        <li><strong>Admit</strong> — signed tokens unlock the protected page or origin.</li>
      </ol>
      <h2>Operator path</h2>
      <p>
        Finish <a href="/admin">/admin</a> setup, tune capacity live, then send traffic through
        <a href="/wait?queue=default&amp;return=/demo">/wait</a>. Estimate spend on
        <a href="/cost">/cost</a>.
      </p>
      <p class="meta">
        <a href="https://tideguard.dev">Website</a>
        <a href="/openapi.yaml">OpenAPI</a>
        <a href="/health">Health</a>
        <a href="https://github.com/TideGuard/TideGuard">GitHub</a>
      </p>
    </main>
  </body>
</html>`;
}

function handleOpenApi(pathname: string): Response {
  if (pathname === "/openapi.json") {
    return new Response(JSON.stringify(OPENAPI_DOCUMENT, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  }
  return new Response(OPENAPI_YAML, {
    headers: {
      "content-type": "application/yaml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
