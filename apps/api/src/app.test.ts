import { describe, expect, it } from 'vitest';
import { app } from './app.js';

describe('GET /health', () => {
  it('returns ok without requiring a database', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });
});

describe('better-auth handler', () => {
  it('is mounted under /api/auth ahead of the static fallback', async () => {
    // better-auth's own health endpoint needs no database, so this proves the catch-all handler is wired
    // (a non-404 better-auth response) without depending on the schema, which Vitest runs before migrate.
    const res = await app.request('/api/auth/ok');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
