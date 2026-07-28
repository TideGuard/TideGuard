import { ApiError } from "../core/errors";
import { renderProtectedDemo } from "../demo/protected";
import { renderWaitingRoom } from "../html/waiting-room";
import { readBranding } from "../admin/store";
import { requireAdmission } from "./queue";
import { parseQueueName } from "./validation";

export async function handleWaitingRoom(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE);
  const embed = url.searchParams.get("embed") === "1";
  const returnTo = sanitizeReturnTo(url.searchParams.get("return") ?? "/demo");
  const branding = await readBranding(env, queue);
  const showWaitingParam = url.searchParams.get("showWaiting");
  const showWaitingCount =
    showWaitingParam === "1" ? true : showWaitingParam === "0" ? false : undefined;

  const html = renderWaitingRoom({
    queue,
    embed,
    returnTo,
    branding,
    ...(showWaitingCount !== undefined ? { showWaitingCount } : {}),
  });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function handleDemo(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const queue = parseQueueName(url.searchParams.get("queue"), env.DEFAULT_QUEUE);

  try {
    const admission = await requireAdmission(request, env, queue);
    const html = renderProtectedDemo({
      queueName: admission.queue,
      visitorId: admission.visitorId,
    });
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "unauthorized") {
      const wait = new URL("/wait", url.origin);
      wait.searchParams.set("queue", queue);
      wait.searchParams.set("return", "/demo");
      return Response.redirect(wait.toString(), 302);
    }
    throw error;
  }
}

export function renderEmbedSnippet(origin: string, queue: string): string {
  const src = `${origin}/wait?queue=${encodeURIComponent(queue)}&embed=1&return=${encodeURIComponent("/demo")}`;
  return `<iframe src="${src}" title="TideGuard waiting room" style="width:100%;min-height:420px;border:0;border-radius:12px;" loading="lazy"></iframe>`;
}

function sanitizeReturnTo(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/demo";
  }
  return value;
}
