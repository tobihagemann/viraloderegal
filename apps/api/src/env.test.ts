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
  // environment (CI sets DATABASE_URL); the template's blank values are then filled with a placeholder.
  it('.env.example lists every key production requires', async () => {
    const { env: devEnv } = await loadEnv();
    vi.resetModules();
    for (const key of Object.keys(devEnv)) vi.stubEnv(key, '');
    const template = parseEnv(readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8'));
    for (const [key, value] of Object.entries(template)) vi.stubEnv(key, value || 'placeholder-value-at-least-32-characters');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(loadEnv()).resolves.toBeDefined();
  });
});
