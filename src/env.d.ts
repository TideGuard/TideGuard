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
  }
}

interface Env {
  TOKEN_SECRET: string;
  ORIGIN_URL?: string;
  ORIGIN_PROTECT_ALL?: string;
  ORIGIN_PATH_PREFIXES?: string;
}
