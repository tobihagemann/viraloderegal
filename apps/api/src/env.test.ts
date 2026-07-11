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
