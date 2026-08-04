/**
 * Signed visitor tickets prove ownership of a queue slot (join → status/leave/heartbeat).
 * Separate from admission tokens so /status cannot mint access from visitorId alone.
 */

import { decodeJson, encodeJson, hmacSign, timingSafeEqual } from "./crypto";
import { TokenError } from "./token";

export interface VisitorTicketClaims {
  typ: "ticket";
  sub: string;
  queue: string;
  iat: number;
  exp: number;
}

export async function signVisitorTicket(
  input: { visitorId: string; queue: string; ttlSeconds: number; nowMs?: number },
  secret: string,
): Promise<string> {
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const claims: VisitorTicketClaims = {
    typ: "ticket",
    sub: input.visitorId,
    queue: input.queue,
    iat: nowSeconds,
    exp: nowSeconds + input.ttlSeconds,
  };
  const payload = encodeJson(claims);
  const signature = await hmacSign(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyVisitorTicket(
  token: string,
  secret: string,
  options: { expectedVisitorId?: string; expectedQueue?: string; nowSeconds?: number } = {},
): Promise<VisitorTicketClaims> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new TokenError("invalid_token", "Malformed visitor ticket");
  }
  const [payload, signature] = parts;
  const expected = await hmacSign(secret, payload);
  if (!(await timingSafeEqual(signature, expected))) {
    throw new TokenError("invalid_token", "Invalid visitor ticket signature");
  }

  let claims: VisitorTicketClaims;
  try {
    claims = decodeJson<VisitorTicketClaims>(payload);
  } catch {
    throw new TokenError("invalid_token", "Invalid visitor ticket payload");
  }

  if (
    claims.typ !== "ticket" ||
    typeof claims.sub !== "string" ||
    typeof claims.queue !== "string" ||
    typeof claims.exp !== "number" ||
    typeof claims.iat !== "number"
  ) {
    throw new TokenError("invalid_token", "Invalid visitor ticket claims");
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    throw new TokenError("expired_token", "Visitor ticket has expired");
  }
  if (options.expectedVisitorId && claims.sub !== options.expectedVisitorId) {
    throw new TokenError("invalid_token", "Visitor ticket mismatch");
  }
  if (options.expectedQueue && claims.queue !== options.expectedQueue) {
    throw new TokenError("invalid_token", "Visitor ticket queue mismatch");
  }

  return claims;
}

export function readTicketCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === "tg_ticket") {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
