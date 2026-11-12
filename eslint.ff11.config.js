// FF11 hard limit: any function in core with cyclomatic complexity >= 10 fails CI.
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.test.ts"] },
  {
    files: ["packages/core/src/**/*.ts", "packages/contracts/src/**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    rules: { complexity: ["error", { max: 9 }] },
  },
);
