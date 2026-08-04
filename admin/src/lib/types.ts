export interface QueueMetrics {
  queue: string;
  waiting: number;
  admitted: number;
  entered: number;
  holding: number;
  openSlots: number;
  capacity: number;
  admitPerSecond: number;
  admitPerSecondOverride: number | null;
  admitPerSecondDefault: number;
  estimatedWaitSeconds: number;
  averageWaitSeconds: number;
  oldestWaitSeconds: number;
  paused: boolean;
  admissionMode: "queue" | "lottery";
  opensAt: number | null;
  effectiveAdmitPerSecond: number;
  totalInflow: number;
  inflowCurrent: number;
  outflowCurrent: number;
  health: {
    enabled: boolean;
    level: "ok" | "slow" | "pause";
    lastCheckedAt: number | null;
    lastLatencyMs: number | null;
    lastStatus: number | null;
    lastError: string | null;
    overrideUntil: number | null;
    autoPaused: boolean;
  };
}

export interface TrafficBucket {
  t: number;
  joins: number;
  admits: number;
  maxOutflow: number;
  waiting: number;
  entered: number;
}

export interface TrafficResponse {
  ok: boolean;
  queue: string;
  bucketMs: number;
  buckets: TrafficBucket[];
  totalInflow: number;
  refreshedAt: number;
}

export interface SetupPendingPublic {
  apiTokenReady: boolean;
  cloudflareReady: boolean;
  turnstileReady: boolean;
  turnstileSitekey: string | null;
  proxyOk: boolean;
  sslIsStrict: boolean;
  sslMode: string | null;
  hostnameAttached: boolean;
  hostname: string | null;
  zoneId: string | null;
  accountId: string | null;
}

export interface BootstrapResponse {
  setupComplete: boolean;
  claimed: boolean;
  claimedUsername: string | null;
  defaultQueue: string;
  version: string;
  turnstileSitekey: string | null;
  setupPending: SetupPendingPublic | null;
}

export interface WaitingRoomBranding {
  primaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  fontFamily: string;
  title: string;
  message: string;
  showWaitingCount: boolean;
  redirectUrl: string;
  requireClickToEnter: boolean;
  admitHoldSeconds: number;
  enterButtonLabel: string;
  playTurnSound: boolean;
}

export interface OriginSettings {
  enabled: boolean;
  originUrl: string;
  protectAll: boolean;
  pathPrefixes: string[];
}

export interface BypassSettings {
  allowlist: string[];
  allowlistText: string;
  zoneId: string | null;
  hostname: string | null;
  hasApiToken: boolean;
  accountId: string | null;
  workerService: string | null;
  clientIp: string | null;
  clientIpMatched: boolean;
  connectingIpPresent: boolean;
}

export interface GeoBlockSettings {
  enabled: boolean;
  active: boolean;
  countries: string[];
  countriesText: string;
  expiresAt: number | null;
  updatedAt: number | null;
  clientCountry: string | null;
  clientBlocked: boolean;
  hoursRemaining: number | null;
  stats: {
    totalHits: number;
    byCountry: Array<{ country: string; hits: number }>;
    lastHitAt: number | null;
    lastHitCountry: string | null;
    windowStartedAt: number | null;
  };
}

export interface TurnstileSettings {
  configured: boolean;
  sitekey: string | null;
  domains: string[];
}

export interface HealthConfig {
  enabled?: boolean;
  url?: string;
  intervalSeconds?: number;
  maxLatencyMs?: number;
  expectStatus?: number;
  slowRateMultiplier?: number;
  failThreshold?: number;
  recoverThreshold?: number;
}

export interface TeamInvite {
  id: string;
  createdAt: number;
  expiresAt: number;
  createdByUsername: string;
}

export interface AdminState {
  queue: string;
  branding: WaitingRoomBranding;
  metrics: QueueMetrics;
  admissionMode: "queue" | "lottery";
  origin: OriginSettings;
  bypass: BypassSettings;
  geoBlock: GeoBlockSettings;
  turnstile: TurnstileSettings;
  traffic: {
    opensAt: number | null;
    paused: boolean;
    health: QueueMetrics["health"];
    effectiveAdmitPerSecond: number;
    admitPerSecond: number;
    admitPerSecondOverride: number | null;
    admitPerSecondDefault: number;
    totalInflow: number;
    inflowCurrent: number;
    outflowCurrent: number;
    healthConfig: HealthConfig;
  };
  version: string;
  me: { id: string; username: string };
  team: {
    users: Array<{ id: string; username: string; createdAt: number }>;
    invites: TeamInvite[];
  };
}

export type DashboardSection =
  "live" | "admission" | "branding" | "access" | "cloudflare" | "team" | "system";
