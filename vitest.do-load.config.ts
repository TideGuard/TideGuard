import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Durable Object load suite (opt-in via RUN_DO_LOAD=1).
 * Prefer smaller N than the in-memory suite (each join is an RPC).
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TOKEN_SECRET: "test-token-secret-do-not-use-in-production",
        },
      },
    }),
  ],
  test: {
    include: ["test/load/queue-room-load.test.ts"],
    testTimeout: 600_000,
  },
});
