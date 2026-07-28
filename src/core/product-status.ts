/**
 * Central product status for README, landing, health, and docs.
 * Avoid hardcoding "Public Beta" / version strings across surfaces.
 */
export const PRODUCT_STATUS = {
  label: "Public Beta",
  version: "0.1.0",
  productionReady: false,
  headline:
    "TideGuard is currently in public beta. Test it against your expected traffic pattern before using it for mission-critical events.",
} as const;

export type ProductStatus = typeof PRODUCT_STATUS;
