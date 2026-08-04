/**
 * Default English waiting-room copy. Swap via branding later or ?lang= stubs.
 * Keep keys stable for i18n hooks.
 */

export type WaitingRoomLocale = "en";

export interface WaitingRoomStrings {
  brand: string;
  positionLabel: string;
  lotteryLabel: string;
  waitLabel: string;
  depthLabel: string;
  openNow: string;
  opensIn: string;
  soundLabel: string;
  statusJoining: string;
  statusWaiting: string;
  statusAdmitted: string;
  statusHold: string;
}

export const WAITING_ROOM_STRINGS: Record<WaitingRoomLocale, WaitingRoomStrings> = {
  en: {
    brand: "TideGuard",
    positionLabel: "Position",
    lotteryLabel: "Your chance",
    waitLabel: "Est. wait",
    depthLabel: "Waiting",
    openNow: "Admissions are open",
    opensIn: "Opens in",
    soundLabel: "Play a sound when it is your turn",
    statusJoining: "Joining the line…",
    statusWaiting: "Waiting for your turn…",
    statusAdmitted: "You are through — continuing…",
    statusHold: "Your spot is ready — continue when you are",
  },
};

export function resolveWaitingRoomLocale(raw: string | null | undefined): WaitingRoomLocale {
  if (raw === "en") return "en";
  return "en";
}

export function waitingRoomStrings(locale: WaitingRoomLocale = "en"): WaitingRoomStrings {
  return WAITING_ROOM_STRINGS[locale] ?? WAITING_ROOM_STRINGS.en;
}
