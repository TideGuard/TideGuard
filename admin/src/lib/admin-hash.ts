import type { DashboardSection } from "./types";

/** Panel id → dashboard tab that contains it. */
const PANEL_TO_SECTION: Record<string, DashboardSection> = {
  live: "live",
  traffic: "live",
  admission: "admission",
  branding: "branding",
  origin: "access",
  "access-gates": "access",
  "cf-access": "access",
  cloudflare: "cloudflare",
  turnstile: "cloudflare",
  team: "team",
  activity: "system",
  updates: "system",
  webhooks: "system",
  "secret-rotation": "system",
  danger: "system",
  system: "system",
};

const SECTIONS = new Set<DashboardSection>([
  "live",
  "admission",
  "branding",
  "access",
  "cloudflare",
  "team",
  "system",
]);

export function parseAdminHash(hash: string): {
  section: DashboardSection;
  panelId: string | null;
} {
  const raw = hash.replace(/^#/, "").trim().toLowerCase();
  if (!raw) return { section: "live", panelId: null };
  if (SECTIONS.has(raw as DashboardSection)) {
    return { section: raw as DashboardSection, panelId: null };
  }
  const section = PANEL_TO_SECTION[raw];
  if (section) return { section, panelId: raw };
  return { section: "live", panelId: null };
}

export function hashForSection(section: DashboardSection): string {
  return `#${section}`;
}

export function scrollToAdminPanel(panelId: string | null): void {
  if (!panelId) return;
  window.requestAnimationFrame(() => {
    const el = document.getElementById(panelId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
