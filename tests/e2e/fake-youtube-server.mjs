// A dependency-free stand-in for the YouTube Data API videos.list endpoint, launched as a Playwright
// webServer so the e2e API (YOUTUBE_TRANSPORT=fake) reaches it instead of the real API. It serves
// videos.list-shaped JSON, 500s for reserved fail-ids, and counts requests per id so specs can assert whether
// an outbound call fired. Only the node:http builtin, no third-party imports — no build step, no type surface.

import { createServer } from 'node:http';

const port = Number(process.env.E2E_YOUTUBE_PORT);

// Fixtures the specs drive are all fail-ids: a 500 counts the attempt but never persists a fresh snapshot, so
// they stay stale across CI retries (a control fetch stays observable; a wrongful replacement fetch stays a
// regression). See seed-fixtures.ts for how each is used.
const FAIL_IDS = new Set(['E2EFAILVC01', 'E2ESTALEA01', 'E2ESTALEB02']);

// Per-id cumulative request counters. No reset endpoint: specs assert on before/after deltas so the shared
// server stays race-free across parallel specs and CI retries.
const counts = new Map();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/__health') {
    json(res, 200, { ok: true });
    return;
  }
  if (url.pathname === '/__count') {
    const id = url.searchParams.get('id') ?? '';
    json(res, 200, { count: counts.get(id) ?? 0 });
    return;
  }
  if (url.pathname === '/videos') {
    const id = url.searchParams.get('id') ?? '';
    // Count the attempt first, so an errored call still registers.
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (FAIL_IDS.has(id)) {
      json(res, 500, { error: { message: 'fake youtube error' } });
      return;
    }
    // Mirror the real API: any other id yields an empty result. No fixture needs a success item — every e2e
    // fixture is a fail-id and the seeded pool is fresh (never re-fetched). An empty result is safe either way:
    // resolveFreshSnapshot falls back to the stored snapshot, and an upsert of an unknown id maps to video_not_found.
    json(res, 200, { items: [] });
    return;
  }
  json(res, 404, { error: { message: 'not found' } });
});

server.listen(port);
