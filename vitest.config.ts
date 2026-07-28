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
  },
});
