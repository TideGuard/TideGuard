/**
 * Admin invite links: opaque token shown once, hash stored in KV with 72h TTL.
 */

import { bytesToBase64Url, timingSafeEqual } from "../auth/crypto";
import { INVITE_TTL_SECONDS, type PendingInvite, inviteKey } from "./types";

const INVITE_INDEX_KEY = "admin:invite-index";

export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteError";
  }
}

export async function createInvite(
  env: Env,
  actor: { id: string; username: string },
): Promise<{ invite: PendingInvite; token: string; acceptPath: string }> {
  const id = randomId(8);
  const token = randomToken(24);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const invite: PendingInvite = {
    id,
    tokenHash,
    createdAt: now,
    expiresAt: now + INVITE_TTL_SECONDS * 1000,
    createdById: actor.id,
    createdByUsername: actor.username,
  };

  await env.CONFIG_KV.put(inviteKey(id), JSON.stringify(invite), {
    expirationTtl: INVITE_TTL_SECONDS,
  });
  await addToIndex(env, id);

  return {
    invite,
    token,
    acceptPath: `/admin?invite=${encodeURIComponent(`${id}.${token}`)}`,
  };
}

export async function listInvites(env: Env): Promise<PendingInvite[]> {
  const ids = await readIndex(env);
  const invites: PendingInvite[] = [];
  const alive: string[] = [];
  const now = Date.now();

  for (const id of ids) {
    const invite = await readInvite(env, id);
    if (!invite) continue;
    if (invite.expiresAt <= now) {
      await env.CONFIG_KV.delete(inviteKey(id));
      continue;
    }
    invites.push(invite);
    alive.push(id);
  }

  if (alive.length !== ids.length) {
    await writeIndex(env, alive);
  }

  return invites.sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeInvite(env: Env, id: string): Promise<boolean> {
  const existing = await readInvite(env, id);
  await env.CONFIG_KV.delete(inviteKey(id));
  await removeFromIndex(env, id);
  return existing !== null;
}

export async function consumeInvite(env: Env, rawToken: string): Promise<PendingInvite> {
  const parsed = parseInviteToken(rawToken);
  if (!parsed) {
    throw new InviteError("Invalid invite link");
  }

  const invite = await readInvite(env, parsed.id);
  if (!invite) {
    throw new InviteError("Invite not found or expired");
  }
  if (invite.expiresAt <= Date.now()) {
    await env.CONFIG_KV.delete(inviteKey(parsed.id));
    await removeFromIndex(env, parsed.id);
    throw new InviteError("Invite has expired");
  }

  const hash = await sha256Hex(parsed.token);
  if (!(await timingSafeEqual(hash, invite.tokenHash))) {
    throw new InviteError("Invalid invite link");
  }

  await env.CONFIG_KV.delete(inviteKey(parsed.id));
  await removeFromIndex(env, parsed.id);
  return invite;
}

export async function clearAllInvites(env: Env): Promise<void> {
  const ids = await readIndex(env);
  await Promise.all(ids.map((id) => env.CONFIG_KV.delete(inviteKey(id))));
  await env.CONFIG_KV.delete(INVITE_INDEX_KEY);
}

export function toPublicInvite(invite: PendingInvite): {
  id: string;
  createdAt: number;
  expiresAt: number;
  createdByUsername: string;
} {
  return {
    id: invite.id,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    createdByUsername: invite.createdByUsername,
  };
}

function parseInviteToken(raw: string): { id: string; token: string } | null {
  const trimmed = raw.trim();
  const dot = trimmed.indexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return null;
  const id = trimmed.slice(0, dot);
  const token = trimmed.slice(dot + 1);
  if (!/^[a-f0-9]{16}$/i.test(id) || token.length < 16) return null;
  return { id: id.toLowerCase(), token };
}

async function readInvite(env: Env, id: string): Promise<PendingInvite | null> {
  try {
    const raw = await env.CONFIG_KV.get(inviteKey(id), "json");
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Partial<PendingInvite>;
    if (
      typeof obj.id !== "string" ||
      typeof obj.tokenHash !== "string" ||
      typeof obj.createdAt !== "number" ||
      typeof obj.expiresAt !== "number" ||
      typeof obj.createdById !== "string" ||
      typeof obj.createdByUsername !== "string"
    ) {
      return null;
    }
    return {
      id: obj.id,
      tokenHash: obj.tokenHash,
      createdAt: obj.createdAt,
      expiresAt: obj.expiresAt,
      createdById: obj.createdById,
      createdByUsername: obj.createdByUsername,
    };
  } catch {
    return null;
  }
}

async function readIndex(env: Env): Promise<string[]> {
  try {
    const raw = await env.CONFIG_KV.get(INVITE_INDEX_KEY, "json");
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

async function writeIndex(env: Env, ids: string[]): Promise<void> {
  await env.CONFIG_KV.put(INVITE_INDEX_KEY, JSON.stringify(ids));
}

async function addToIndex(env: Env, id: string): Promise<void> {
  const ids = await readIndex(env);
  if (!ids.includes(id)) {
    ids.push(id);
    await writeIndex(env, ids);
  }
}

async function removeFromIndex(env: Env, id: string): Promise<void> {
  const ids = await readIndex(env);
  const next = ids.filter((x) => x !== id);
  if (next.length === 0) {
    await env.CONFIG_KV.delete(INVITE_INDEX_KEY);
  } else {
    await writeIndex(env, next);
  }
}

function randomId(bytes: number): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function randomToken(bytes: number): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
