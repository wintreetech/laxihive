import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  expect: { timeout: 8000 },
  use: {
    baseURL: "http://localhost:5185",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  reporter: "list",
  workers: 1,
  webServer: [
    {
      command: "node --import tsx test/browser-server.ts",
      cwd: fileURLToPath(new URL("../backend/", import.meta.url)),
      url: "http://localhost:4011/api/__fixture",
      timeout: 60000,
      reuseExistingServer: false,
      env: { LEXIHIVE_E2E_FIXTURE: "true" },
    },
    {
      command: "node scripts/test-frontend.mjs",
      url: "http://localhost:5185",
      timeout: 60000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: "core", testMatch: ["platform.spec.ts", "verification.spec.ts"] },
    { name: "billing", testMatch: "billing.spec.ts", dependencies: ["core"] },
    { name: "launch", testMatch: "launch.spec.ts", dependencies: ["billing"] },
  ],
});
