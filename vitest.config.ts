import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"] } },
  test: {
    include: ["packages/**/src/**/*.test.ts", "apps/**/*.test.ts", "tools/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "spikes/**"],
    // FF4: every test runs with outbound sockets blocked (see tools/ff/block-network.ts).
    setupFiles: ["./tools/ff/block-network.ts"],
    testTimeout: 60_000,
    pool: "forks",
  },
});
