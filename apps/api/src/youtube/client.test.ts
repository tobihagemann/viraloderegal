import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUOTA_BACKOFF_MS } from './constants.js';

// Give the client a configured key and a controllable clock + fetch. resetModules per test gives the client's
// module-scoped quota-backoff state a clean slate, so test order does not matter.
vi.mock('../env.js', () => ({ env: { YOUTUBE_API_KEY: 'test-key' }, isProduction: false }));

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function loadClient() {
  return import('./client.js');
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchViewCount', () => {
  it('returns the parsed view count', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ statistics: { viewCount: '12345' } }] }));
    const { fetchViewCount } = await loadClient();
    expect(await fetchViewCount('dQw4w9WgXcQ')).toBe(12345);
  });

  it('throws YouTubeNotFoundError on an empty items array', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));
    const { fetchViewCount, YouTubeNotFoundError } = await loadClient();
    await expect(fetchViewCount('dQw4w9WgXcQ')).rejects.toBeInstanceOf(YouTubeNotFoundError);
  });
});

describe('fetchVideoForUpsert', () => {
  it('returns metadata and view count from a single videos.list call', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [{ snippet: { title: 'T', channelTitle: 'C' }, contentDetails: { duration: 'PT1M' }, statistics: { viewCount: '7' } }] }),
    );
    const { fetchVideoForUpsert } = await loadClient();
    expect(await fetchVideoForUpsert('dQw4w9WgXcQ')).toEqual({ metadata: { title: 'T', channel: 'C', durationSec: 60 }, viewCount: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('quota backoff', () => {
  it('arms on a quota 403, short-circuits further calls without fetching, and clears after the backoff', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403));
    const { fetchViewCount, isQuotaExhausted, YouTubeQuotaError } = await loadClient();

    await expect(fetchViewCount('dQw4w9WgXcQ')).rejects.toBeInstanceOf(YouTubeQuotaError);
    expect(isQuotaExhausted()).toBe(true);

    // A second call while exhausted throws without issuing another request.
    await expect(fetchViewCount('dQw4w9WgXcQ')).rejects.toBeInstanceOf(YouTubeQuotaError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Once the backoff window passes, the flag clears and the next call fetches again.
    vi.setSystemTime(new Date(Date.now() + QUOTA_BACKOFF_MS + 1));
    expect(isQuotaExhausted()).toBe(false);
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ statistics: { viewCount: '5' } }] }));
    expect(await fetchViewCount('dQw4w9WgXcQ')).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not arm the backoff on a non-quota 403', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { errors: [{ reason: 'keyInvalid' }] } }, 403));
    const { fetchViewCount, isQuotaExhausted } = await loadClient();
    await expect(fetchViewCount('dQw4w9WgXcQ')).rejects.toThrow();
    expect(isQuotaExhausted()).toBe(false);
  });
});
