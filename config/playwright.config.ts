import { defineConfig } from "@playwright/test";

// Browser: Playwright's Chromium (`npx playwright install chromium`), or set DP_E2E_CHROME to the
// path of a Chrome/Chromium binary. Tests skip themselves if the UI is not built (static/). Paths are relative to this file.
const exe = process.env.DP_E2E_CHROME;

export default defineConfig({
  testDir: "../tests/browser",
  outputDir: "../test-results",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    viewport: { width: 1500, height: 950 },
    launchOptions: exe ? { executablePath: exe } : {},
  },
});
