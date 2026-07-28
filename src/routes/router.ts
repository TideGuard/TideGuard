import { ApiError, jsonError } from "../core/errors";
import {
  handleAdminBootstrap,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminPage,
  handleAdminReset,
  handleAdminSaveBranding,
  handleAdminSetMode,
  handleAdminSetup,
  handleAdminState,
} from "./admin";
import { handleCostEstimateApi, handleCostPage } from "./cost";
import { handleHealth } from "./health";
import { handleDemo, handleWaitingRoom } from "./pages";
import {
  handleAdmit,
  handleHeartbeat,
  handleJoin,
  handleLeave,
  handleMetrics,
  handleMode,
  handleStatus,
} from "./queue";

/**
 * HTTP router for the TideGuard Worker.
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return handleHealth(env);
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

    if (request.method === "POST" && url.pathname === "/api/admin/mode") {
      return await handleAdminSetMode(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/admin/reset") {
      return await handleAdminReset(request, env);
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

    if (request.method === "POST" && url.pathname === "/admit") {
      return await handleAdmit(request, env);
    }

    if (request.method === "POST" && url.pathname === "/mode") {
      return await handleMode(request, env);
    }

    if (request.method === "GET" && url.pathname === "/metrics") {
      return await handleMetrics(request, env);
    }

    throw new ApiError("not_found", `No route for ${request.method} ${url.pathname}`, 404);
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error);
    }

    console.error("Unhandled error", error);
    return jsonError(new ApiError("internal_error", "Unexpected server error", 500));
  }
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
      }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Source Sans 3", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, #16384a 0%, transparent 45%),
          linear-gradient(160deg, #07151c, #0b1f2a 55%, #123041);
        color: var(--fg);
        display: grid;
        place-items: center;
        padding: 2rem;
      }
      main { max-width: 36rem; }
      h1 {
        font-family: "Fraunces", Georgia, serif;
        font-weight: 650;
        font-size: clamp(2.4rem, 6vw, 3.4rem);
        margin: 0 0 0.75rem;
        letter-spacing: -0.02em;
        text-wrap: balance;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: var(--muted);
        text-wrap: pretty;
      }
      a { color: var(--accent); }
      .meta {
        margin-top: 1.5rem;
        font-size: 0.95rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1.1rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>TideGuard</h1>
      <p>
        Open-source waiting room for Cloudflare Workers. Protect traffic spikes
        with Queue Mode (FIFO) or Lottery Mode at the edge.
      </p>
      <p class="meta">
        <a href="https://tideguard.dev">Website</a>
        <a href="/demo">Try the demo</a>
        <a href="/wait?queue=default&return=/demo">Waiting room</a>
        <a href="/admin">Admin</a>
        <a href="/cost">Calculate cost</a>
        <a href="/health">Health</a>
        <a href="/metrics">Metrics</a>
      </p>
    </main>
  </body>
</html>`;
}
