import { defineConfig, devices } from '@playwright/test';

// Default to 3000; E2E_PORT overrides it so the suite can run on a free port when another local server
// already holds 3000.
const port = process.env.E2E_PORT ?? '3000';

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  // Run the built API in production mode so it serves the built SPA (serveStatic) at baseURL alongside the
  // lobby REST + ws protocol. Specs drive the browser UI; the raw-protocol specs still use the request
  // fixture and a ws client.
  webServer: {
    command: 'node apps/api/dist/server.js',
    url: `http://localhost:${port}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    // Production mode makes DATABASE_URL required (no dev fallback), so set it explicitly — preserving CI's
    // override while letting a bare local checkout reach the dev Compose stack. WEB_DIST_DIR resolves
    // against the repo-root cwd. Trust X-Forwarded-For so specs can isolate per-IP rate-limit and ban
    // buckets via the header. Production also makes the admin-auth/SMTP/bootstrap vars required, so supply
    // them; MAIL_TRANSPORT=json keeps the invite flow offline (no mail server) and the bootstrap admin
    // credentials drive the auth specs.
    env: {
      NODE_ENV: 'production',
      PORT: port,
      TRUST_PROXY: '1',
      // The raw openWs() helper can't send X-Forwarded-For, so every raw-protocol ws upgrade shares the
      // wsjoin:127.0.0.1 loopback bucket; raise the limit (not a disable) so a suite run never trips it.
      WS_JOIN_RATE_LIMIT: '5000',
      WEB_DIST_DIR: 'apps/web/dist',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://viraloderegal:viraloderegal@localhost:5432/viraloderegal',
      BETTER_AUTH_SECRET: 'e2e-better-auth-secret-0123456789-abcdef',
      BETTER_AUTH_URL: `http://localhost:${port}`,
      MAIL_TRANSPORT: 'json',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '587',
      SMTP_USER: 'viraloderegal',
      SMTP_PASSWORD: 'viraloderegal',
      SMTP_FROM: 'Viral oder Egal <noreply@viraloderegal.de>',
      BOOTSTRAP_ADMIN_EMAIL: 'admin@viraloderegal.de',
      BOOTSTRAP_ADMIN_PASSWORD: 'bootstrap-admin-password',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
