/**
 * Cloudflare API helpers for zone setup used by IP allowlist.
 *
 * Allowlisting needs CF-Connecting-IP, which appears when DNS is proxied (orange cloud).
 * IP Geolocation (CF-IPCountry) is a separate zone setting — useful for country, not for IP match.
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

export class CloudflareApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = status;
  }
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
      `No A/AAAA/CNAME record found for ${hostname}. Add a DNS record and point the hostname at this Worker (custom domain or route).`,
    );
    return {
      ok: false,
      summary: `No DNS records found for ${hostname}`,
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
      "Turn on the orange cloud (proxied) for these records so traffic hits Cloudflare. TideGuard can do this with Fix setup.",
    );
    suggestions.push(
      "Allowlist uses CF-Connecting-IP (automatic when proxied). IP Geolocation (CF-IPCountry) is a different header for country codes.",
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
      "IP Geolocation is off. Optional — enables CF-IPCountry (country), not required for IP allowlist. Fix setup can turn it on.",
    );
  }

  suggestions.push(
    "Also confirm this hostname is attached to the TideGuard Worker (Custom domains or Routes).",
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

async function getIpGeolocation(apiToken: string, zoneId: string): Promise<ZoneSettingState> {
  const data = await cfFetch<{ result: ZoneSettingState }>(
    apiToken,
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ip_geolocation`,
  );
  return data.result;
}

async function setIpGeolocation(
  apiToken: string,
  zoneId: string,
  value: "on" | "off",
): Promise<void> {
  await cfFetch(apiToken, `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ip_geolocation`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
}

function isSettingOn(value: string | boolean | number | null): boolean {
  return value === true || value === "on" || value === 1 || value === "1";
}

async function cfFetch<T>(apiToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
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
      body.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
      `Cloudflare API error (${response.status})`;
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
