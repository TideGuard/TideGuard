/**
 * Default waiting-room branding.
 * Stored shape matches future KV admin saves; page render only (not /status polls).
 */
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
  /** When true, the waiting room shows total people currently waiting. */
  showWaitingCount: boolean;
  /**
   * Default post-admit redirect path (same-origin relative, e.g. `/checkout`).
   * Overridden by `?return=` on `/wait` when that query is present.
   * Empty string → TideGuard picks `/` (origin proxy on) or `/demo`.
   */
  redirectUrl: string;
  /**
   * When true, admitted visitors must click a button to continue instead of
   * auto-redirect. Access tokens are issued only after they confirm.
   */
  requireClickToEnter: boolean;
  /** Seconds to click Continue before the admitted spot is released (15–900). */
  admitHoldSeconds: number;
  /** Label on the Continue button when requireClickToEnter is on. */
  enterButtonLabel: string;
}

export const DEFAULT_BRANDING: WaitingRoomBranding = {
  primaryColor: "#2bb0a6",
  backgroundColor: "#07151c",
  surfaceColor: "#0b1f2a",
  textColor: "#e8f1f5",
  mutedColor: "#8aa4b0",
  accentColor: "#3dd6c8",
  fontFamily: '"Fraunces", "IBM Plex Serif", Georgia, serif',
  title: "You’re in line",
  message: "We’re letting people in at a steady pace. This page updates automatically.",
  showWaitingCount: false,
  redirectUrl: "",
  requireClickToEnter: false,
  admitHoldSeconds: 120,
  enterButtonLabel: "Continue",
};

export function mergeBranding(
  overrides: Partial<WaitingRoomBranding> | null | undefined,
): WaitingRoomBranding {
  return { ...DEFAULT_BRANDING, ...overrides };
}

/** Same-origin relative path only (open-redirect safe). */
export function sanitizeRedirectUrl(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  if (trimmed.length > 512) {
    return fallback;
  }
  return trimmed;
}
