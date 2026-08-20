/**
 * Secrets and optional overrides.
 * Queue name, admission mode, and origin proxy are set in /admin (KV);
 * optional env fields below remain for advanced dashboard overrides only —
 * they are not prompted by Deploy to Cloudflare (not in wrangler.jsonc vars).
 * Wrangler-generated Env is merged with these declarations.
 */
declare namespace Cloudflare {
  interface Env {
    /** Operator / emergency secret (claim, Bearer, factory reset). Required. */
    TOKEN_SECRET: string;
    /** Visitor admission tokens + queue tickets. Optional; falls back to TOKEN_SECRET. */
    ADMISSION_SECRET?: string;
    /** Admin session cookies. Optional; falls back to TOKEN_SECRET. */
    ADMIN_SESSION_SECRET?: string;
    /** KV credential sealing (AES-GCM). Optional; falls back to TOKEN_SECRET. */
    SEAL_SECRET?: string;
    /** Optional override; default queue name comes from setup / "default". */
    DEFAULT_QUEUE?: string;
    /** Optional override; live mode is set via /admin or POST /mode. */
    ADMISSION_MODE?: string;
    ORIGIN_URL?: string;
    ORIGIN_PROTECT_ALL?: string;
    ORIGIN_PATH_PREFIXES?: string;
    /** Advanced: fixed status poll ms (disables adaptive). Not recommended. */
    WAITING_ROOM_POLL_INTERVAL_MS?: string;
    /** Advanced: fixed heartbeat ms with fixed poll override. Not recommended. */
    WAITING_ROOM_HEARTBEAT_INTERVAL_MS?: string;
    ASSETS?: Fetcher;
  }
}

interface Env {
  TOKEN_SECRET: string;
  ADMISSION_SECRET?: string;
  ADMIN_SESSION_SECRET?: string;
  SEAL_SECRET?: string;
  DEFAULT_QUEUE?: string;
  ADMISSION_MODE?: string;
  ORIGIN_URL?: string;
  ORIGIN_PROTECT_ALL?: string;
  ORIGIN_PATH_PREFIXES?: string;
  WAITING_ROOM_POLL_INTERVAL_MS?: string;
  WAITING_ROOM_HEARTBEAT_INTERVAL_MS?: string;
  ASSETS?: Fetcher;
}
