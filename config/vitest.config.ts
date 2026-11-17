import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit, API and CLI tests (no browser). Paths are relative to the repo root.
export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 20000,
  },
});
