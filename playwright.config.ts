import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  // Run the built API (which serves the lobby REST + ws protocol) against the migrated database. Specs
  // drive it via the request fixture and a ws client; the SPA does not exist yet.
  webServer: {
    command: 'node apps/api/dist/server.js',
    url: 'http://localhost:3000/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    // Playwright merges this over process.env, so DATABASE_URL is inherited (CI sets it; locally the API
    // falls back to the dev Compose stack). Trust X-Forwarded-For so specs can isolate per-IP rate-limit
    // and ban buckets via the header.
    env: { PORT: '3000', TRUST_PROXY: '1' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
