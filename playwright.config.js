import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/dev.mjs --demo",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
