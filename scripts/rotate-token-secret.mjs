#!/usr/bin/env node
/**
 * Generate a TOKEN_SECRET and print a safe rotation checklist.
 * Does not call Cloudflare — you must put the secret yourself.
 *
 * Usage: npm run rotate:token-secret
 *        node scripts/rotate-token-secret.mjs --print-only
 */
import { randomBytes } from "node:crypto";

const printOnly = process.argv.includes("--print-only");
const secret = randomBytes(32).toString("hex");

console.log("");
console.log("TideGuard TOKEN_SECRET rotation");
console.log("================================");
console.log("");
console.log("New secret (copy once; do not commit):");
console.log(secret);
console.log("");
if (!printOnly) {
  console.log("1. Keep the OLD secret until cutover succeeds.");
  console.log("2. Put the new secret on the Worker:");
  console.log("     npx wrangler secret put TOKEN_SECRET");
  console.log("   (paste the value above when prompted)");
  console.log("3. Expect all visitor tokens + admin sessions to fail immediately.");
  console.log("4. Re-sign in at /admin; re-seal Cloudflare + Turnstile if needed.");
  console.log("5. Re-save webhook signing secret if you use operator webhooks.");
  console.log("6. Smoke-test /wait?return=/demo then Pass queue.");
  console.log("7. Full guide: docs/token-secret-rotation.md");
  console.log("");
}
