import { ApiError } from "../../core/errors";
import { requireAdminSession, requireTokenSecret } from "../../auth/operator";
import { isAdminClaimed, isAdminSetupComplete } from "../../admin/store";
import { readBypassSettings, readCloudflareApiToken } from "../../admin/bypass-store";
import { formatTurnstileOperatorError } from "../../admin/operator-errors";
import { verifyTurnstileToken } from "../../admin/cloudflare-api";
import { readTurnstileSecret, readTurnstileSettings } from "../../admin/turnstile-store";
import { clientConnectingIp } from "../../auth/client-ip";

/** Mid-wizard steps after claim: admin session required; reject if already finished. */
export async function requireSetupWizardSession(request: Request, env: Env) {
  if (await isAdminSetupComplete(env)) {
    throw new ApiError("conflict", "Admin setup is already complete", 409);
  }
  if (!(await isAdminClaimed(env))) {
    throw new ApiError("unauthorized", "Claim the Worker before continuing setup", 401);
  }
  return requireAdminSession(request, env);
}

export function requireSetupBearer(request: Request, env: Env): void {
  const secret = requireTokenSecret(env);
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  if (!bearer || !timingSafeStringEqualSync(bearer, secret)) {
    throw new ApiError(
      "unauthorized",
      "Paste your TOKEN_SECRET as Authorization Bearer (same value as in .dev.vars / Wrangler secrets).",
      401,
    );
  }
}

export async function requireTurnstileResponse(
  request: Request,
  env: Env,
  body: Record<string, unknown>,
): Promise<void> {
  const settings = await readTurnstileSettings(env);
  if (!settings) {
    return;
  }
  const secret = await readTurnstileSecret(env);
  if (!secret) {
    throw new ApiError("unauthorized", "Turnstile is misconfigured", 401);
  }
  const token =
    typeof body.turnstileToken === "string"
      ? body.turnstileToken
      : typeof body["cf-turnstile-response"] === "string"
        ? body["cf-turnstile-response"]
        : "";
  const result = await verifyTurnstileToken({
    secret,
    token,
    remoteip: clientConnectingIp(request),
  });
  if (!result.success) {
    throw new ApiError("unauthorized", formatTurnstileOperatorError(result.errorCodes), 401);
  }
}

export async function requireSavedCloudflare(
  env: Env,
  options?: { needAccount?: boolean },
): Promise<{
  apiToken: string;
  zoneId: string;
  accountId: string | null;
  workerService: string;
}> {
  const settings = await readBypassSettings(env);
  const apiToken = await readCloudflareApiToken(env);
  if (!apiToken) {
    throw new ApiError("bad_request", "Save a Cloudflare API token first", 400);
  }
  if (!settings.zoneId) {
    throw new ApiError("bad_request", "zoneId is required", 400);
  }
  if (options?.needAccount && !settings.accountId) {
    throw new ApiError(
      "bad_request",
      "Account id missing — re-save Cloudflare access to refresh zone metadata",
      400,
    );
  }
  return {
    apiToken,
    zoneId: settings.zoneId,
    accountId: settings.accountId,
    workerService: settings.workerService || "tideguard",
  };
}

export function clientKey(request: Request, action: string): string {
  const ip = clientConnectingIp(request) || "unknown";
  return `${action}:${ip}`;
}

export function parsePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new ApiError("bad_request", "password must be 8–128 characters", 400);
  }
  return value;
}

export function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function timingSafeStringEqualSync(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}
