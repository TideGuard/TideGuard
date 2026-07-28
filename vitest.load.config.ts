import { defineConfig } from "vitest/config";

/**
 * Fast in-memory load suite (no Workers runtime).
 * For Durable Object RPC load, use vitest.do-load.config.ts.
 */
export default defineConfig({
  test: {
    include: ["test/load/queue-scale.test.ts"],
    testTimeout: 300_000,
  },
});
