/**
 * Secrets are not declared in wrangler.jsonc.
 * Merge them onto the generated Env interface.
 */
declare namespace Cloudflare {
  interface Env {
    TOKEN_SECRET: string;
  }
}

interface Env {
  TOKEN_SECRET: string;
}
