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
};

export function mergeBranding(
  overrides: Partial<WaitingRoomBranding> | null | undefined,
): WaitingRoomBranding {
  return { ...DEFAULT_BRANDING, ...overrides };
}
