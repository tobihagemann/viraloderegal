import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminVideos, clampInt, youtubeErrorCode } from './adminVideos.js';
import { YouTubeConfigError, YouTubeNotFoundError, YouTubeQuotaError } from '../youtube/client.js';

// Drive the real Hono sub-app with the boundary mocked: a pass-through admin guard, a configured YouTube key,
// a canned videos.list item, and a db whose insert rejects with the check-violation. This exercises the POST /
// catch as it stands (adminVideos.ts) — it reddens if the catch is deleted, its constraint name changed, or
// its response code changed. The mapping is otherwise unreachable through the route (Zod + the pre-insert
// duration guard already cover every CHECK clause), so this is the only way to reach the catch with real data.
vi.mock('../auth/requireAdmin.js', () => ({
  requireAdmin: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));
vi.mock('../env.js', () => ({ env: { YOUTUBE_API_KEY: 'test-key', YOUTUBE_TRANSPORT: 'live' }, isProduction: false }));
vi.mock('../db/kysely.js', () => {
  const rejectingInsert = {
    values: () => rejectingInsert,
    onConflict: () => rejectingInsert,
    execute: () => Promise.reject({ code: '23514', constraint: 'videos_clip_segment_check' }),
  };
  return { db: { insertInto: () => rejectingInsert } };
});

describe('clampInt', () => {
  it('falls back on missing or non-numeric input', () => {
    expect(clampInt(undefined, 20, 1, 100)).toBe(20);
    expect(clampInt('abc', 20, 1, 100)).toBe(20);
  });

  it('truncates fractional values and clamps into range', () => {
    expect(clampInt('3.9', 20, 1, 100)).toBe(3);
    expect(clampInt('0', 20, 1, 100)).toBe(1);
    expect(clampInt('-5', 20, 1, 100)).toBe(1);
    expect(clampInt('99999', 20, 1, 100)).toBe(100);
  });
});

describe('youtubeErrorCode', () => {
  it('maps each YouTube error class to its code and returns null otherwise', () => {
    expect(youtubeErrorCode(new YouTubeConfigError())).toBe('config_missing');
    expect(youtubeErrorCode(new YouTubeQuotaError())).toBe('quota_exhausted');
    expect(youtubeErrorCode(new YouTubeNotFoundError('x'))).toBe('video_not_found');
    expect(youtubeErrorCode(new Error('boom'))).toBeNull();
  });
});

describe('POST / upsert check-violation mapping', () => {
  beforeEach(() => {
    // Duration (60s) comfortably exceeds the request's clipEndSec, so the pre-insert clipEndSec > durationSec
    // guard does not fire early and execution reaches the insert.
    const item = { snippet: { title: 'T', channelTitle: 'C' }, contentDetails: { duration: 'PT1M' }, statistics: { viewCount: '7' } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [item] }), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a videos_clip_segment_check violation to a 400 clip_out_of_range', async () => {
    const res = await adminVideos.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ youtubeId: 'dQw4w9WgXcQ', clipStartSec: 10, clipEndSec: 18, enabled: true, randomEligible: true, notes: null }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'clip_out_of_range' });
  });
});
