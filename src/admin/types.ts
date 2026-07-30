import type { AdmissionMode } from "../core/types";
import type { WaitingRoomBranding } from "../core/branding";

export const ADMIN_CONFIG_KEY = "admin:config";
export const BRANDING_KEY_PREFIX = "branding:";
export const INVITE_KEY_PREFIX = "admin:invite:";
export const AUDIT_LOG_KEY = "admin:audit";

export const INVITE_TTL_SECONDS = 72 * 60 * 60;
export const AUDIT_LOG_MAX_EVENTS = 200;

export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: number;
}

export interface AdminConfig {
  /** False after claim until Finish completes CF + Turnstile + queue/branding. */
  setupComplete: boolean;
  users: AdminUser[];
  createdAt: number;
  defaultQueue: string;
  /** @deprecated Legacy single-password installs; migrated on read. */
  passwordHash?: string;
  /** @deprecated Legacy single-password installs; migrated on read. */
  passwordSalt?: string;
}

export interface AdminSetupInput {
  username: string;
  password: string;
  queue?: string;
  admissionMode?: AdmissionMode;
  branding?: Partial<WaitingRoomBranding>;
}

export interface PendingInvite {
  id: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  createdById: string;
  createdByUsername: string;
}

export interface AuditEvent {
  id: string;
  at: number;
  actorId: string;
  actorUsername: string;
  action: string;
  summary: string;
  meta?: Record<string, string | number | boolean | null>;
}

export function brandingKey(queue: string): string {
  return `${BRANDING_KEY_PREFIX}${queue}`;
}

export function inviteKey(id: string): string {
  return `${INVITE_KEY_PREFIX}${id}`;
}

/** Normalize usernames for storage and lookup (lowercase, trimmed). */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string {
  const username = normalizeUsername(raw);
  if (username.length < 2 || username.length > 32) {
    throw new Error("Username must be 2–32 characters");
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    throw new Error(
      "Username may use letters, numbers, dots, underscores, and hyphens (must start with alphanumeric)",
    );
  }
  return username;
}
