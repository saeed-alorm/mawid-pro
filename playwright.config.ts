import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env["CI"] ? 1 : 0,
  use: {
    launchOptions: { executablePath: process.env["MAWID_CHROMIUM_EXECUTABLE"] },
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npm run preview:pages",
    url: "http://127.0.0.1:4173/mawid-pro/",
    reuseExistingServer: !process.env["CI"],
  },
});
