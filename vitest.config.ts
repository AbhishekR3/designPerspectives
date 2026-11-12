import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// FF4: the network block is loaded with `--import` so it also applies to worker threads (which inherit
// execArgv) and to child processes (NODE_OPTIONS).
const BLOCK_NETWORK = fileURLToPath(new URL("./tools/ff/block-network.mjs", import.meta.url));

export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"] } },
  test: {
    include: ["packages/**/src/**/*.test.ts", "apps/**/*.test.ts", "tools/**/*.test.ts", "examples/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "spikes/**"],
    setupFiles: ["./tools/ff/block-network.mjs"],
    execArgv: ["--import", BLOCK_NETWORK],
    env: { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${BLOCK_NETWORK}`.trim() },
    testTimeout: 60_000,
    pool: "forks",
  },
});
