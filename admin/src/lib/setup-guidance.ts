/** In-wizard copy, Cloudflare deeplinks, and field help for first-time setup. */

export const SETUP_STEPS = [
  { id: 1, label: "Account", short: "Claim the Worker and create the first admin." },
  {
    id: 2,
    label: "Cloudflare",
    short: "Give TideGuard scoped API access to check DNS, SSL, and Turnstile.",
  },
  { id: 3, label: "Turnstile", short: "Provision bot protection for admin login." },
  { id: 4, label: "Queue", short: "Choose how visitors wait before the event." },
  { id: 5, label: "Branding", short: "Set the waiting-room look; saved on Finish." },
] as const;

export type CfPhase = "token" | "zone" | "ssl" | "domain";

export const CF_PHASE_LABELS: Record<CfPhase, string> = {
  token: "2a · API token",
  zone: "2b · Zone & hostname",
  ssl: "2c · SSL",
  domain: "2d · Custom domain",
};

export const LINKS = {
  apiTokens: "https://dash.cloudflare.com/profile/api-tokens",
  createTokenDocs: "https://developers.cloudflare.com/fundamentals/api/get-started/create-token/",
  findIds: "https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/",
  zoneOverview: "https://dash.cloudflare.com/?to=/:account/:zone/",
  dnsRecords: "https://dash.cloudflare.com/?to=/:account/:zone/dns/records",
  sslTls: "https://dash.cloudflare.com/?to=/:account/:zone/ssl-tls",
  workersAndPages: "https://dash.cloudflare.com/?to=/:account/workers-and-pages",
} as const;

export const TOKEN_PERMISSIONS = [
  "Zone → DNS → Edit",
  "Zone → Zone → Read",
  "Zone → Zone Settings → Edit",
  "Account → Turnstile → Edit",
  "Account → Workers Scripts → Edit",
] as const;

export const FIELD_HELP = {
  apiToken: {
    label: "API token",
    why: "TideGuard calls the Cloudflare API to check proxied DNS, manage SSL, attach domains, and create Turnstile.",
    how: "Open API Tokens → Create Token → Create Custom Token. Scope Zone Resources to the zone that fronts TideGuard. Copy the token once.",
  },
  zoneId: {
    label: "Zone ID",
    why: "Identifies the Cloudflare zone TideGuard will manage.",
    how: "Dashboard → your domain → Overview → API section → copy Zone ID (32 hex chars). Leave blank to resolve from hostname.",
  },
  hostname: {
    label: "Hostname",
    why: "The DNS name that must be proxied (orange cloud) so TideGuard receives CF-Connecting-IP and can gate traffic.",
    how: "Usually www.example.com or the apex. Must match an A, AAAA, or CNAME record in the zone.",
  },
  workerService: {
    label: "Worker service",
    why: "The Workers script name used when attaching a custom domain (Wrangler name).",
    how: "Default tideguard matches Deploy to Cloudflare. Change only if you renamed the Worker.",
  },
} as const;

export function passwordChecks(password: string, confirm: string) {
  return {
    length: password.length >= 8 && password.length <= 128,
    upper: /[A-Z]/.test(password),
    digitOrSymbol: /[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password),
    match: password.length > 0 && password === confirm,
  };
}

export function isPasswordReady(password: string, confirm: string): boolean {
  const c = passwordChecks(password, confirm);
  return c.length && c.upper && c.digitOrSymbol && c.match;
}
