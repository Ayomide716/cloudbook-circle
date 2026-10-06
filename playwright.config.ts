import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a local Supabase (`supabase start`) and the dev server.
 * Needs E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY and E2E_SUPABASE_SERVICE_KEY
 * (CI reads them from `supabase status -o env`). See e2e/README.md.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    // A phone first: most people use CloudBook on one.
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? "",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_ANON_KEY ?? "",
      // The test database has every update, so test the features that need them too.
      VITE_DB_UPDATES_2026_10: "true",
    },
  },
});
