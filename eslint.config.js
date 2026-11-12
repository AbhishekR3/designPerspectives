// FF11: cyclomatic complexity in core — warn above 5, fail at 10 or more (spec file 01 §6).
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/node_modules/**",
      "spikes/**",
      "fixtures/repos/**",
      "**/*.cjs",
      "apps/desktop/renderer-dist/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mjs", "**/*.js"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // warn > 5
    files: ["packages/core/src/**/*.ts", "packages/contracts/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: { complexity: ["warn", { max: 5 }] },
  },
);
