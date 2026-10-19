import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

// env.ts parses process.env at import and throws on an invalid config, so each case stubs the relevant vars and
// (re)imports the module fresh. Directly exercises the fail-closed .superRefine — the wiring that keeps the
// key-bearing request from being pointed anywhere but a loopback fake — rather than only its isLoopbackBaseUrl
// predicate. DB-free: env parsing touches no database.
describe('YOUTUBE transport env guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const loadEnv = () => import('./env.js');

  it('accepts fake transport with a loopback base URL', async () => {
    vi.stubEnv('YOUTUBE_TRANSPORT', 'fake');
    vi.stubEnv('YOUTUBE_API_BASE_URL', 'http://localhost:3100');
    const { env } = await loadEnv();
    expect(env.YOUTUBE_TRANSPORT).toBe('fake');
    expect(env.YOUTUBE_API_BASE_URL).toBe('http://localhost:3100');
  });

  it('rejects fake transport with no base URL', async () => {
    vi.stubEnv('YOUTUBE_TRANSPORT', 'fake');
    await expect(loadEnv()).rejects.toThrow('Invalid environment configuration');
  });

  it('rejects fake transport with a non-loopback base URL', async () => {
    vi.stubEnv('YOUTUBE_TRANSPORT', 'fake');
    vi.stubEnv('YOUTUBE_API_BASE_URL', 'https://www.googleapis.com');
    await expect(loadEnv()).rejects.toThrow('Invalid environment configuration');
  });

  it('rejects a stray base URL in live transport', async () => {
    vi.stubEnv('YOUTUBE_API_BASE_URL', 'http://localhost:3100');
    await expect(loadEnv()).rejects.toThrow('Invalid environment configuration');
  });

  it('defaults to live transport and no base URL when neither is set', async () => {
    const { env } = await loadEnv();
    expect(env.YOUTUBE_TRANSPORT).toBe('live');
    expect(env.YOUTUBE_API_BASE_URL).toBeUndefined();
  });
});

describe('BETTER_AUTH_URL production guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const loadEnv = () => import('./env.js');

  const stubProductionEnv = (betterAuthUrl: string) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgres://viraloderegal:viraloderegal@postgres:5432/viraloderegal');
    vi.stubEnv('WEB_DIST_DIR', '/app/web');
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-better-auth-secret-0123456789-abcdef');
    vi.stubEnv('BETTER_AUTH_URL', betterAuthUrl);
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_PORT', '587');
    vi.stubEnv('SMTP_USER', 'viraloderegal');
    vi.stubEnv('SMTP_PASSWORD', 'viraloderegal');
    vi.stubEnv('SMTP_FROM', 'Viral oder Egal <noreply@viraloderegal.de>');
    vi.stubEnv('BOOTSTRAP_ADMIN_EMAIL', 'admin@viraloderegal.de');
    vi.stubEnv('BOOTSTRAP_ADMIN_PASSWORD', 'viraloderegal');
  };

  it('accepts a public https origin', async () => {
    stubProductionEnv('https://viraloderegal.de');
    const { env } = await loadEnv();
    expect(env.BETTER_AUTH_URL).toBe('https://viraloderegal.de');
  });

  it.each(['http://viraloderegal.de', 'http://app:3000', 'localhost:18752'])('rejects the non-https origin %s', async (url) => {
    stubProductionEnv(url);
    await expect(loadEnv()).rejects.toThrow('Invalid environment configuration');
  });

  it.each(['http://localhost:18752', 'https://localhost', 'http://127.0.0.1/x', 'http://[::1]:18752'])('rejects the loopback origin %s', async (url) => {
    stubProductionEnv(url);
    await expect(loadEnv()).rejects.toThrow('Invalid environment configuration');
  });

  it('rejects a malformed URL', async () => {
    stubProductionEnv('viraloderegal.de');
    await expect(loadEnv()).rejects.toThrow('Invalid environment configuration');
  });

  it('admits an http loopback root behind the explicit opt-in', async () => {
    stubProductionEnv('http://localhost:18752');
    vi.stubEnv('ALLOW_LOOPBACK_AUTH_URL', '1');
    const { env } = await loadEnv();
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:18752');
  });

  it.each(['http://viraloderegal.de', 'https://localhost'])('keeps rejecting %s behind the opt-in', async (url) => {
    stubProductionEnv(url);
    vi.stubEnv('ALLOW_LOOPBACK_AUTH_URL', '1');
    await expect(loadEnv()).rejects.toThrow('Invalid environment configuration');
  });
});

describe('blank env values', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const loadEnv = () => import('./env.js');

  it('treats a blank value as unset, so the dev default applies', async () => {
    vi.stubEnv('BETTER_AUTH_URL', '');
    const { env } = await loadEnv();
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:18752');
  });

  it('still fails fast on a blank required value in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_URL', '');
    await expect(loadEnv()).rejects.toThrow('Invalid environment configuration');
  });

  // Every key production requires must appear in .env.example, or a prod .env built from it fails at boot. The
  // dev parse enumerates the schema's keys so each is blanked (unset) first and none is masked by the ambient
  // environment (CI sets DATABASE_URL); the template's blank values are then filled with a placeholder that is also
  // a valid production BETTER_AUTH_URL.
  it('.env.example lists every key production requires', async () => {
    const { env: devEnv } = await loadEnv();
    vi.resetModules();
    for (const key of Object.keys(devEnv)) vi.stubEnv(key, '');
    const template = parseEnv(readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8'));
    for (const [key, value] of Object.entries(template)) vi.stubEnv(key, value || 'https://placeholder.example/at-least-32-characters');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(loadEnv()).resolves.toBeDefined();
  });
});
