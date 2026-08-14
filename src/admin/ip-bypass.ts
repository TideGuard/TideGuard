/**
 * Mint a normal admission cookie for allowlisted client IPs (no DO / no queue slot).
 */

import { buildAccessCookie, buildAdmissionClaims, signAccessToken } from "../auth";
import { clientConnectingIp } from "../auth/client-ip";
import { requireTokenSecret } from "../auth/operator";
import { configFromEnv, getQueueRoom } from "../queue/client";
import { isIpAllowlisted, readBypassSettings } from "./bypass-store";

export interface IpBypassAdmission {
  visitorId: string;
  queue: string;
  accessToken: string;
  accessCookie: string;
  clientIp: string;
}

export async function maybeAdmitIpBypass(
  request: Request,
  env: Env,
  queue: string,
): Promise<IpBypassAdmission | null> {
  const settings = await readBypassSettings(env);
  if (settings.allowlist.length === 0) {
    return null;
  }

  const clientIp = clientConnectingIp(request);
  if (!isIpAllowlisted(clientIp, settings) || !clientIp) {
    return null;
  }

  const config = configFromEnv(env);
  const secret = requireTokenSecret(env);
  const epoch = await getQueueRoom(env, queue).getTokenEpoch();
  const visitorId = `bypass_${clientIp.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 100)}`;
  const accessToken = await signAccessToken(
    buildAdmissionClaims({
      visitorId,
      queue,
      tokenTTLSeconds: config.tokenTTLSeconds,
      epoch,
    }),
    secret,
  );

  return {
    visitorId,
    queue,
    accessToken,
    accessCookie: buildAccessCookie(accessToken, request, config.tokenTTLSeconds),
    clientIp,
  };
}
