import { defineConfig } from "oxlint";

/**
 * Oxlint config (Oxc). Replaces ESLint + typescript-eslint.
 * Type-aware rules use oxlint-tsgolint (TypeScript 7 / typescript-go).
 */
export default defineConfig({
  options: {
    typeAware: true,
  },
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.wrangler/**",
    "worker-configuration.d.ts",
    "**/coverage/**",
    "admin/vite.config.ts",
  ],
  rules: {
    "typescript/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    "typescript/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
  overrides: [
    {
      files: ["scripts/**/*.{js,mjs,cjs}", "admin/**/*.{cjs,js}"],
      rules: {
        "no-console": "off",
      },
    },
  ],
});
