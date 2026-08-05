/**
 * Cloudflare API helpers for zone setup, SSL, custom domains, and Turnstile.
 *
 * Allowlisting needs CF-Connecting-IP (proxied DNS). IP Geolocation enables CF-IPCountry.
 * Credentials live in KV; live zone/Worker settings stay on Cloudflare.
 */

export interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  zone_name?: string;
}

export interface ZoneSettingState {
  id: string;
  value: string | boolean | number | null;
  editable: boolean;
}

export interface ProxyCheckResult {
  ok: boolean;
  summary: string;
  zoneId: string;
  hostname: string;
  records: Array<{
    id: string;
    type: string;
    name: string;
    proxied: boolean;
    content: string;
  }>;
  /** IP Geolocation zone setting (CF-IPCountry). Null if the API call failed. */
  ipGeolocation: { on: boolean } | null;
  suggestions: string[];
}

export interface ZoneProbeResult {
  zoneId: string;
  zoneName: string;
  accountId: string;
  status: string;
}

export interface CloudflareVerifyResult {
  tokenValid: boolean;
  zone: ZoneProbeResult;
  proxy: ProxyCheckResult;
  ssl: { mode: string | null; isStrict: boolean };
  domains: {
    workerService: string;
    attached: WorkerDomain[];
    hostnameAttached: boolean;
  };
}

export interface WorkerDomain {
  id: string;
  hostname: string;
  service: string;
  zoneId: string;
  zoneName: string;
}

export interface TurnstileWidget {
  sitekey: string;
  secret: string;
  name: string;
  domains: string[];
  mode: string;
}

export class CloudflareApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = status;
  }
}

/** Cloudflare always-pass test secret — skip network in siteverify. */
export const TURNSTILE_TEST_PASS_SECRET = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_PASS_SITEKEY = "1x00000000000000000000AA";

export async function verifyApiToken(apiToken: string): Promise<{ status: string; id: string }> {
  const data = await cfFetch<{
    result: { id: string; status: string };
  }>(apiToken, "https://api.cloudflare.com/client/v4/user/tokens/verify");
  const result = data.result;
  if (!result || result.status !== "active") {
    throw new CloudflareApiError("Cloudflare API token is not active", 401);
  }
  return { status: result.status, id: result.id };
}

export async function getZone(apiToken: string, zoneId: string): Promise<ZoneProbeResult> {
  const data = await cfFetch<{
    result: {
      id: string;
      name: string;
      status: string;
      account?: { id: string; name?: string };
    };
  }>(apiToken, `https://api.cloudflare.com/client/v4/zones/${zoneId}`);
  const zone = data.result;
  if (!zone?.id || !zone.account?.id) {
    throw new CloudflareApiError("Zone response missing account id", 502);
  }
  return {
    zoneId: zone.id,
    zoneName: zone.name,
    accountId: zone.account.id,
    status: zone.status,
  };
}

/** Resolve zone id from a hostname or apex name when the operator left Zone ID blank. */
export async function findZoneIdByHostname(
  apiToken: string,
  hostname: string,
): Promise<string | null> {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  const parts = host.split(".").filter(Boolean);
  const candidates =
    parts.length >= 2
      ? [host, parts.slice(-2).join("."), ...(parts.length > 2 ? [parts.slice(-3).join(".")] : [])]
      : [host];

  for (const name of candidates) {
    const url = new URL("https://api.cloudflare.com/client/v4/zones");
    url.searchParams.set("name", name);
    url.searchParams.set("per_page", "5");
    const data = await cfFetch<{ result: Array<{ id: string; name: string }> }>(
      apiToken,
      url.toString(),
    );
    const match = data.result?.find((z) => z.name === name);
    if (match) {
      return match.id;
    }
  }
  return null;
}

export async function checkHostnameProxy(input: {
  apiToken: string;
  zoneId: string;
  hostname: string;
}): Promise<ProxyCheckResult> {
  const hostname = input.hostname.replace(/\.$/, "").toLowerCase();
  const [records, ipGeo] = await Promise.all([
    listDnsRecords(input.apiToken, input.zoneId, hostname),
    getIpGeolocation(input.apiToken, input.zoneId).catch(() => null),
  ]);
  const relevant = records.filter((r) => r.type === "A" || r.type === "AAAA" || r.type === "CNAME");

  const suggestions: string[] = [];
  const ipGeolocation = ipGeo === null ? null : { on: isSettingOn(ipGeo.value) };

  if (relevant.length === 0) {
    suggestions.push(
      `Add an A, AAAA, or CNAME record for ${hostname} in this Cloudflare zone (or fix a typo in the hostname).`,
    );
    suggestions.push(
      "Optional later: Attach custom domain can create the Workers hostname binding when you are ready for production traffic.",
    );
    return {
      ok: false,
      summary: `No DNS A/AAAA/CNAME found for ${hostname}`,
      zoneId: input.zoneId,
      hostname,
      records: [],
      ipGeolocation,
      suggestions,
    };
  }

  const unproxied = relevant.filter((r) => !r.proxied);
  if (unproxied.length > 0) {
    suggestions.push(
      `Click Fix setup to orange-cloud (proxy) ${unproxied.length} DNS-only record(s) so traffic hits Cloudflare.`,
    );
    suggestions.push(
      "Proxied DNS is required for CF-Connecting-IP (allowlist). IP Geolocation (CF-IPCountry) is separate and optional.",
    );
    return {
      ok: false,
      summary: `${unproxied.length} record(s) for ${hostname} are DNS-only (grey cloud)`,
      zoneId: input.zoneId,
      hostname,
      records: relevant.map(publicRecord),
      ipGeolocation,
      suggestions,
    };
  }

  if (ipGeolocation && !ipGeolocation.on) {
    suggestions.push(
      "IP Geolocation is off (optional). Fix setup can enable CF-IPCountry for country block.",
    );
  }

  suggestions.push(
    "Custom domain is optional until go-live — use Attach custom domain when this hostname should hit the TideGuard Worker.",
  );

  const geoNote =
    ipGeolocation === null
      ? "IP Geolocation setting could not be read (need Zone Settings Read)"
      : ipGeolocation.on
        ? "IP Geolocation on (CF-IPCountry)"
        : "IP Geolocation off";

  return {
    ok: true,
    summary: `Proxied OK — CF-Connecting-IP available · ${geoNote}`,
    zoneId: input.zoneId,
    hostname,
    records: relevant.map(publicRecord),
    ipGeolocation,
    suggestions,
  };
}

/** Orange-cloud DNS records and optionally enable IP Geolocation. */
export async function enableHostnameProxy(input: {
  apiToken: string;
  zoneId: string;
  hostname: string;
}): Promise<ProxyCheckResult> {
  const before = await checkHostnameProxy(input);
  const toFix = before.records.filter((r) => !r.proxied);
  for (const record of toFix) {
    await patchDnsRecordProxied(input.apiToken, input.zoneId, record.id, true);
  }
  if (before.ipGeolocation && !before.ipGeolocation.on) {
    await setIpGeolocation(input.apiToken, input.zoneId, "on");
  }
  return checkHostnameProxy(input);
}

export async function getSslMode(
  apiToken: string,
  zoneId: string,
): Promise<{ mode: string | null; isStrict: boolean }> {
  try {
    const setting = await getZoneSetting(apiToken, zoneId, "ssl");
    const mode = setting.value == null ? null : String(setting.value);
    return { mode, isStrict: mode === "strict" };
  } catch {
    return { mode: null, isStrict: false };
  }
}

export async function setSslMode(
  apiToken: string,
  zoneId: string,
  value: "off" | "flexible" | "full" | "strict" | "origin_pull",
): Promise<{ mode: string; isStrict: boolean }> {
  await patchZoneSetting(apiToken, zoneId, "ssl", value);
  return { mode: value, isStrict: value === "strict" };
}

export async function getIpGeolocation(
  apiToken: string,
  zoneId: string,
): Promise<ZoneSettingState> {
  return getZoneSetting(apiToken, zoneId, "ip_geolocation");
}

export async function setIpGeolocation(
  apiToken: string,
  zoneId: string,
  value: "on" | "off",
): Promise<void> {
  await patchZoneSetting(apiToken, zoneId, "ip_geolocation", value);
}

export async function listWorkerDomains(input: {
  apiToken: string;
  accountId: string;
  service?: string;
  hostname?: string;
  zoneId?: string;
}): Promise<WorkerDomain[]> {
  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/workers/domains`,
  );
  if (input.service) url.searchParams.set("service", input.service);
  if (input.hostname) url.searchParams.set("hostname", input.hostname);
  if (input.zoneId) url.searchParams.set("zone_id", input.zoneId);

  const data = await cfFetch<{
    result: Array<{
      id: string;
      hostname: string;
      service: string;
      zone_id: string;
      zone_name: string;
    }>;
  }>(input.apiToken, url.toString());

  return (data.result ?? []).map((d) => ({
    id: d.id,
    hostname: d.hostname,
    service: d.service,
    zoneId: d.zone_id,
    zoneName: d.zone_name,
  }));
}

export async function attachWorkerDomain(input: {
  apiToken: string;
  accountId: string;
  hostname: string;
  service: string;
  zoneId: string;
}): Promise<WorkerDomain> {
  const data = await cfFetch<{
    result: {
      id: string;
      hostname: string;
      service: string;
      zone_id: string;
      zone_name: string;
    };
  }>(
    input.apiToken,
    `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/workers/domains`,
    {
      method: "PUT",
      body: JSON.stringify({
        hostname: input.hostname.replace(/\.$/, "").toLowerCase(),
        service: input.service,
        zone_id: input.zoneId,
      }),
    },
  );
  const d = data.result;
  return {
    id: d.id,
    hostname: d.hostname,
    service: d.service,
    zoneId: d.zone_id,
    zoneName: d.zone_name,
  };
}

export async function detachWorkerDomain(input: {
  apiToken: string;
  accountId: string;
  domainId: string;
}): Promise<void> {
  await cfFetch(
    input.apiToken,
    `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/workers/domains/${input.domainId}`,
    { method: "DELETE" },
  );
}

export async function createTurnstileWidget(input: {
  apiToken: string;
  accountId: string;
  name: string;
  domains: string[];
  mode?: "managed" | "non-interactive" | "invisible";
}): Promise<TurnstileWidget> {
  const data = await cfFetch<{
    result: {
      sitekey: string;
      secret: string;
      name: string;
      domains: string[];
      mode: string;
    };
  }>(
    input.apiToken,
    `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/challenges/widgets`,
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        domains: input.domains,
        mode: input.mode ?? "managed",
        region: "world",
      }),
    },
  );
  const w = data.result;
  if (!w?.sitekey || !w.secret) {
    throw new CloudflareApiError("Turnstile widget create returned no keys", 502);
  }
  return {
    sitekey: w.sitekey,
    secret: w.secret,
    name: w.name,
    domains: w.domains ?? input.domains,
    mode: w.mode,
  };
}

export async function verifyTurnstileToken(input: {
  secret: string;
  token: string;
  remoteip?: string | null;
  expectedHostnames?: string[];
}): Promise<{ success: boolean; hostname?: string; errorCodes: string[] }> {
  if (!input.token || input.token.length > 2048) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  // Documented Cloudflare test secret — always passes (keeps unit tests offline).
  if (input.secret === TURNSTILE_TEST_PASS_SECRET) {
    const hostname = input.expectedHostnames?.[0];
    return hostname
      ? { success: true, hostname, errorCodes: [] }
      : { success: true, errorCodes: [] };
  }

  const body = new URLSearchParams({
    secret: input.secret,
    response: input.token,
  });
  if (input.remoteip) {
    body.set("remoteip", input.remoteip);
  }

  let result: {
    success?: boolean;
    hostname?: string;
    "error-codes"?: string[];
  };
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    result = (await response.json()) as typeof result;
  } catch {
    return { success: false, errorCodes: ["internal-error"] };
  }

  if (!result.success) {
    return { success: false, errorCodes: result["error-codes"] ?? ["invalid-input-response"] };
  }

  if (
    input.expectedHostnames &&
    input.expectedHostnames.length > 0 &&
    result.hostname &&
    !input.expectedHostnames.includes(result.hostname)
  ) {
    return { success: false, hostname: result.hostname, errorCodes: ["hostname-mismatch"] };
  }

  return result.hostname
    ? { success: true, hostname: result.hostname, errorCodes: [] }
    : { success: true, errorCodes: [] };
}

/** Full verify used by wizard + save-time checks. */
export async function verifyCloudflareAccess(input: {
  apiToken: string;
  zoneId: string;
  hostname: string;
  workerService?: string;
}): Promise<CloudflareVerifyResult> {
  await verifyApiToken(input.apiToken);
  const zone = await getZone(input.apiToken, input.zoneId);
  const workerService = input.workerService?.trim() || "tideguard";
  const [proxy, ssl, domains] = await Promise.all([
    checkHostnameProxy({
      apiToken: input.apiToken,
      zoneId: input.zoneId,
      hostname: input.hostname,
    }),
    getSslMode(input.apiToken, input.zoneId),
    listWorkerDomains({
      apiToken: input.apiToken,
      accountId: zone.accountId,
      service: workerService,
    }).catch(() => [] as WorkerDomain[]),
  ]);

  const host = input.hostname.replace(/\.$/, "").toLowerCase();
  const hostnameAttached = domains.some((d) => d.hostname.toLowerCase() === host);

  return {
    tokenValid: true,
    zone,
    proxy,
    ssl,
    domains: {
      workerService,
      attached: domains,
      hostnameAttached,
    },
  };
}

export function turnstileDomainsForHostname(hostname: string): string[] {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  const domains = new Set<string>(["localhost", "127.0.0.1"]);
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    domains.add(host);
    const parts = host.split(".");
    if (parts.length > 2) {
      domains.add(parts.slice(-2).join("."));
    }
  }
  return [...domains];
}

async function listDnsRecords(
  apiToken: string,
  zoneId: string,
  name: string,
): Promise<CloudflareDnsRecord[]> {
  const url = new URL(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`);
  url.searchParams.set("name", name);
  url.searchParams.set("per_page", "100");

  const data = await cfFetch<{ result: CloudflareDnsRecord[] }>(apiToken, url.toString());
  return data.result ?? [];
}

async function patchDnsRecordProxied(
  apiToken: string,
  zoneId: string,
  recordId: string,
  proxied: boolean,
): Promise<void> {
  await cfFetch(
    apiToken,
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ proxied }),
    },
  );
}

async function getZoneSetting(
  apiToken: string,
  zoneId: string,
  setting: string,
): Promise<ZoneSettingState> {
  const data = await cfFetch<{ result: ZoneSettingState }>(
    apiToken,
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${setting}`,
  );
  return data.result;
}

async function patchZoneSetting(
  apiToken: string,
  zoneId: string,
  setting: string,
  value: string | boolean | number,
): Promise<void> {
  await cfFetch(
    apiToken,
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${setting}`,
    {
      method: "PATCH",
      body: JSON.stringify({ value }),
    },
  );
}

function isSettingOn(value: string | boolean | number | null): boolean {
  return value === true || value === "on" || value === 1 || value === "1";
}

async function cfFetch<T>(apiToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${apiToken}`);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(url, {
    ...init,
    headers,
  });

  let body: {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: unknown;
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new CloudflareApiError("Cloudflare API returned a non-JSON response", response.status);
  }

  if (!response.ok || body.success === false) {
    const message =
      body.errors
        ?.map((e) => e.message)
        .filter(Boolean)
        .join("; ") || `Cloudflare API error (${response.status})`;
    throw new CloudflareApiError(message, response.status);
  }

  return body as T;
}

function publicRecord(record: CloudflareDnsRecord) {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    proxied: record.proxied,
    content: record.content,
  };
}
