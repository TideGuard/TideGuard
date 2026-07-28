import type { AdmissionMode } from "../core/types";
import type { WaitingRoomBranding } from "../core/branding";

export const ADMIN_CONFIG_KEY = "admin:config";
export const ADMIN_QUEUES_KEY = "admin:queues";
export const BRANDING_KEY_PREFIX = "branding:";

export interface AdminConfig {
  setupComplete: true;
  passwordHash: string;
  passwordSalt: string;
  createdAt: number;
  defaultQueue: string;
}

export interface AdminSetupInput {
  password: string;
  queue?: string;
  admissionMode?: AdmissionMode;
  branding?: Partial<WaitingRoomBranding>;
}

export function brandingKey(queue: string): string {
  return `${BRANDING_KEY_PREFIX}${queue}`;
}
