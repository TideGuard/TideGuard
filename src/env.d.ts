/**
 * Secrets and optional origin proxy vars.
 * Wrangler-generated Env is merged with these declarations.
 */
declare namespace Cloudflare {
  interface Env {
    TOKEN_SECRET: string;
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
  ORIGIN_URL?: string;
  ORIGIN_PROTECT_ALL?: string;
  ORIGIN_PATH_PREFIXES?: string;
  WAITING_ROOM_POLL_INTERVAL_MS?: string;
  WAITING_ROOM_HEARTBEAT_INTERVAL_MS?: string;
  ASSETS?: Fetcher;
}
