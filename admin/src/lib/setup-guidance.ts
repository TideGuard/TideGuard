/** In-wizard copy, Cloudflare deeplinks, and field help for first-time setup. */

export const SETUP_STEPS = [
  { id: 1, label: "Account", short: "Claim the Worker and create the first admin." },
  {
    id: 2,
    label: "Cloudflare",
    short: "Connect once so TideGuard can manage DNS, SSL, and Turnstile for you.",
  },
  { id: 3, label: "Turnstile", short: "Add bot protection for admin login." },
  { id: 4, label: "Queue", short: "Choose how visitors wait before the event." },
  { id: 5, label: "Branding", short: "Set the waiting-room look; saved on Finish." },
] as const;

export type CfPhase = "token" | "zone" | "ssl" | "domain";

/** Friendly substep titles shown in the step line (no 2a/2b jargon). */
export const CF_PHASE_LABELS: Record<CfPhase, string> = {
  token: "API token",
  zone: "Your site",
  ssl: "SSL",
  domain: "Domain",
};

export const LINKS = {
  apiTokens: "https://dash.cloudflare.com/profile/api-tokens",
  findIds: "https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/",
  docs: "https://tideguard.dev/docs/",
  docsGettingStarted: "https://tideguard.dev/docs/getting-started/",
  docsAdmin: "https://tideguard.dev/docs/admin/",
  docsOrigin: "https://tideguard.dev/docs/protecting-origin/",
  docsCustomDomain: "https://tideguard.dev/docs/custom-domain/",
  docsBypass: "https://tideguard.dev/docs/ip-allowlist/",
  docsGeo: "https://tideguard.dev/docs/geo-block/",
  docsAnalytics: "https://tideguard.dev/docs/analytics/",
  docsUpgrading: "https://tideguard.dev/docs/upgrading/",
} as const;

/** Short labels for the permission checklist (Cloudflare UI wording). */
export const TOKEN_PERMISSIONS = [
  "Zone · DNS · Edit",
  "Zone · Zone · Read",
  "Zone · Zone Settings · Edit",
  "Account · Turnstile · Edit",
  "Account · Workers Scripts · Edit",
] as const;

export const FIELD_HELP = {
  apiToken: {
    label: "Paste API token",
  },
  zoneId: {
    label: "Zone ID",
    hint: "Optional. On your domain’s Overview page, copy Zone ID — or leave blank.",
  },
  hostname: {
    label: "Hostname",
    hint: "The site visitors use, e.g. www.example.com (must be orange-cloud / proxied).",
  },
  workerService: {
    label: "Worker name",
    hint: "Usually tideguard. Change only if you renamed the Worker.",
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
