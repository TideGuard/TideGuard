import { ApiError, jsonError } from "../core/errors";
import {
  isStaticTideGuardPath,
  isTideGuardPath,
  shouldProxyToOrigin,
  shouldRequireAdmission,
} from "../core/origin";
import { resolveOriginConfig } from "../admin/origin-store";
import {
  appendSetCookies,
  resolveAccessGate,
  waitingRoomRedirectUrl,
  withSecurityHeaders,
} from "../auth";
import { proxyToOrigin } from "../proxy/origin-proxy";
import {
  handleAdminAcceptInvite,
  handleAdminAudit,
  handleAdminBootstrap,
  handleAdminClaim,
  handleAdminCloudflareCheck,
  handleAdminCloudflareDomains,
  handleAdminCloudflareFixProxy,
  handleAdminCloudflareIpGeolocation,
  handleAdminCloudflareSsl,
  handleAdminCreateInvite,
  handleAdminHealth,
  handleAdminListInvites,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminTosAccept,
  handleAdminMetrics,
  handleAdminPage,
  handleAdminPass,
  handleAdminRevokeAdmissions,
  handleAdminPause,
  handleAdminChangePassword,
  handleAdminPasswordRecover,
  handleAdminRecoveryRegenerate,
  handleAdminRate,
  handleAdminClearRate,
  handleAdminRemoveUser,
  handleAdminTraffic,
  handleAdminQueueLimitsGet,
  handleAdminQueueLimitsPut,
  handleAdminReset,
  handleAdminRevokeInvite,
  handleAdminSaveBranding,
  handleAdminCloneBranding,
  handleAdminSaveBypass,
  handleAdminSaveRoomRules,
  handleAdminSaveCloudflare,
  handleAdminSaveGeoBlock,
  handleAdminSaveOrigin,
  handleAdminSaveWebhooks,
  handleAdminSchedule,
  handleAdminSetMode,
  handleAdminSetup,
  handleAdminSetupCloudflareAttachDomain,
  handleAdminSetupCloudflareFix,
  handleAdminSetupCloudflareSsl,
  handleAdminSetupCloudflareTokenVerify,
  handleAdminSetupCloudflareVerify,
  handleAdminSetupTurnstileProvision,
  handleAdminSetupTurnstileVerify,
  handleAdminState,
  handleAdminUpdates,
} from "./admin";
import { geoBlockedResponse } from "../html/geo-blocked";
import { isAdminSetupComplete } from "../admin/store";
import { readRoomRules } from "../admin/room-rules-store";
import { handleCostEstimateApi, handleCostPage } from "./cost";
import { handleHealth } from "./health";
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
import { handleNotificationSound } from "./sounds";
import { serveAdminAssets } from "./admin-assets";

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
        const gate = await resolveAccessGate(request, env, originConfig.queue);
        if (gate.kind === "admitted") {
          return withSecurityHeaders(
            await proxyToOrigin(request, originConfig, {
              visitorId: gate.visitorId,
            }),
          );
        }
        if (gate.kind === "bypass") {
          return withSecurityHeaders(
            appendSetCookies(
              await proxyToOrigin(request, originConfig, {
                visitorId: gate.bypass.visitorId,
              }),
              [gate.bypass.accessCookie],
            ),
          );
        }
        if (gate.kind === "geo_blocked") {
          return withSecurityHeaders(geoBlockedResponse(gate.country));
        }
        if (gate.kind === "passthrough" || gate.kind === "rule_bypass") {
          return withSecurityHeaders(await proxyToOrigin(request, originConfig));
        }
        const wait = waitingRoomRedirectUrl(
          url.origin,
          originConfig.queue,
          `${url.pathname}${url.search}`,
        );
        const roomRules = await readRoomRules(env);
        if (
          roomRules.jsonMode &&
          (request.headers.get("accept") ?? "").includes("application/json")
        ) {
          return withSecurityHeaders(Response.json({ redirect: `${wait.pathname}${wait.search}` }));
        }
        return withSecurityHeaders(Response.redirect(wait.toString(), 302));
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

async function handleTideGuardRoute(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/health") {
    return handleHealth(env);
  }

  if (request.method === "GET" && url.pathname === "/") {
    if (!(await isAdminSetupComplete(env))) {
      return Response.redirect(new URL("/admin", url.origin).toString(), 302);
    }
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

  if (request.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/")) {
    const assets = await serveAdminAssets(request, env);
    if (assets) {
      return assets;
    }
    return await handleAdminPage(request, env);
  }

  if (request.method === "GET" && url.pathname.startsWith("/admin/")) {
    const assets = await serveAdminAssets(request, env);
    if (assets) {
      return assets;
    }
    return new Response("Admin assets not built. Run npm run build:admin.", { status: 503 });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/bootstrap") {
    return await handleAdminBootstrap(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/claim") {
    return await handleAdminClaim(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/setup") {
    return await handleAdminSetup(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/setup/cloudflare/token-verify") {
    return await handleAdminSetupCloudflareTokenVerify(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/setup/cloudflare/verify") {
    return await handleAdminSetupCloudflareVerify(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/setup/cloudflare/fix") {
    return await handleAdminSetupCloudflareFix(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/setup/cloudflare/attach-domain") {
    return await handleAdminSetupCloudflareAttachDomain(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/setup/cloudflare/ssl") {
    return await handleAdminSetupCloudflareSsl(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/setup/turnstile/provision") {
    return await handleAdminSetupTurnstileProvision(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/setup/turnstile/verify") {
    return await handleAdminSetupTurnstileVerify(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    return await handleAdminLogin(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    return await handleAdminLogout(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/tos/accept") {
    return await handleAdminTosAccept(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/state") {
    return await handleAdminState(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/metrics") {
    return await handleAdminMetrics(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/pass") {
    return await handleAdminPass(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/revoke-admissions") {
    return await handleAdminRevokeAdmissions(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/branding") {
    return await handleAdminSaveBranding(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/queues/clone-branding") {
    return await handleAdminCloneBranding(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/origin") {
    return await handleAdminSaveOrigin(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/webhooks") {
    return await handleAdminSaveWebhooks(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/bypass") {
    return await handleAdminSaveBypass(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/room-rules") {
    return await handleAdminSaveRoomRules(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/geo-block") {
    return await handleAdminSaveGeoBlock(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/cloudflare") {
    return await handleAdminSaveCloudflare(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/cloudflare/check") {
    return await handleAdminCloudflareCheck(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/cloudflare/fix-proxy") {
    return await handleAdminCloudflareFixProxy(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/cloudflare/ip-geolocation") {
    return await handleAdminCloudflareIpGeolocation(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/cloudflare/ssl") {
    return await handleAdminCloudflareSsl(request, env);
  }

  if (
    (request.method === "GET" || request.method === "PUT" || request.method === "DELETE") &&
    url.pathname === "/api/admin/cloudflare/domains"
  ) {
    return await handleAdminCloudflareDomains(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/mode") {
    return await handleAdminSetMode(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/pause") {
    return await handleAdminPause(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/rate") {
    return await handleAdminRate(request, env);
  }

  if (request.method === "DELETE" && url.pathname === "/api/admin/rate") {
    return await handleAdminClearRate(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/traffic") {
    return await handleAdminTraffic(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/schedule") {
    return await handleAdminSchedule(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/health") {
    return await handleAdminHealth(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/updates") {
    return await handleAdminUpdates(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/audit") {
    return await handleAdminAudit(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/invites") {
    return await handleAdminListInvites(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/invites") {
    return await handleAdminCreateInvite(request, env);
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/invites/")) {
    return await handleAdminRevokeInvite(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/invites/accept") {
    return await handleAdminAcceptInvite(request, env);
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/password") {
    return await handleAdminChangePassword(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/password/recover") {
    return await handleAdminPasswordRecover(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/recovery/regenerate") {
    return await handleAdminRecoveryRegenerate(request, env);
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/users/")) {
    return await handleAdminRemoveUser(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/queue-limits") {
    return await handleAdminQueueLimitsGet(request, env);
  }
  if (request.method === "PUT" && url.pathname === "/api/admin/queue-limits") {
    return await handleAdminQueueLimitsPut(request, env);
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

  if (request.method === "GET" && url.pathname === "/sounds/notification.mp3") {
    return handleNotificationSound();
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
        <a href="https://tideguard.dev/docs/">Docs</a>
        <a href="https://github.com/TideGuard/TideGuard">GitHub</a>
        <a href="/demo">Try the demo</a>
        <a href="/wait?queue=default&return=/demo">Waiting room</a>
        <a href="/admin">Admin</a>
        <a href="/cost">Calculate cost</a>
        <a href="/health">Health</a>
      </p>
    </main>
  </body>
</html>`;
}
