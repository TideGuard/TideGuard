import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

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
    exclude: ["**/node_modules/**", "**/dist/**", "**/test/load/**"],
    coverage: {
      // Istanbul required: V8 coverage needs node:inspector, which workerd stubs out.
      provider: "istanbul",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "**/node_modules/**", "**/test/**", "**/dist/**"],
      reporter: ["text", "text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 60,
      },
    },
  },
});
