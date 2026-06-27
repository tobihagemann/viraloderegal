import { videoUpsertSchema, youtubeIdSchema } from '@viraloderegal/shared';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { toVideoDto } from '../curation/videoDto.js';
import { errorJson } from '../http/errorResponse.js';
import { requireAdmin } from '../auth/requireAdmin.js';
import { isCheckViolation } from '../db/constraints.js';
import { db } from '../db/kysely.js';
import {
  fetchVideoForUpsert,
  fetchViewCount,
  isQuotaExhausted,
  quotaResetsAt,
  YouTubeConfigError,
  YouTubeNotFoundError,
  YouTubeQuotaError,
} from '../youtube/client.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// The YouTube/clip error union the routes translate into a { code }/status response, mirroring rooms.ts's
// JOIN_ERROR_STATUS. config_missing/quota_exhausted are operational (503); the others are bad input (4xx).
type CurationError = 'config_missing' | 'quota_exhausted' | 'video_not_found' | 'clip_out_of_range';

const CURATION_ERROR_STATUS: Record<CurationError, ContentfulStatusCode> = {
  config_missing: 503,
  quota_exhausted: 503,
  video_not_found: 404,
  clip_out_of_range: 400,
};

// Map a YouTube client error to its { code }, or null when it is not a known curation error (rethrow).
export function youtubeErrorCode(err: unknown): CurationError | null {
  if (err instanceof YouTubeConfigError) {
    return 'config_missing';
  }
  if (err instanceof YouTubeQuotaError) {
    return 'quota_exhausted';
  }
  if (err instanceof YouTubeNotFoundError) {
    return 'video_not_found';
  }
  return null;
}

const metadataRequestSchema = z.object({ youtubeId: youtubeIdSchema });

export function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export const adminVideos = new Hono()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const page = clampInt(c.req.query('page'), 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampInt(c.req.query('pageSize'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const q = (c.req.query('q') ?? '').trim();
    let base = db.selectFrom('videos');
    if (q) {
      const like = `%${q}%`;
      base = base.where((eb) => eb.or([eb('youtube_id', 'ilike', like), eb('title_snapshot', 'ilike', like), eb('channel_snapshot', 'ilike', like)]));
    }
    const totalRow = await base.select((eb) => eb.fn.countAll().as('count')).executeTakeFirst();
    const rows = await base
      .selectAll()
      .orderBy('title_snapshot')
      .orderBy('youtube_id')
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute();
    return c.json({ videos: rows.map(toVideoDto), total: Number(totalRow?.count ?? 0), page, pageSize });
  })
  // Quota state for the admin banner. In-memory, so it needs no DB and no fetch.
  .get('/status', (c) => c.json({ quotaExhausted: isQuotaExhausted(), quotaResetsAt: quotaResetsAt() }))
  // Fetch metadata for the form to prefill; does not persist.
  .post('/metadata', async (c) => {
    const body = metadataRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return errorJson(c, 'invalid_request', 400);
    }
    try {
      const { metadata, viewCount } = await fetchVideoForUpsert(body.data.youtubeId);
      return c.json({ title: metadata.title, channel: metadata.channel, durationSec: metadata.durationSec, viewCount });
    } catch (err) {
      const code = youtubeErrorCode(err);
      if (code) {
        return errorJson(c, code, CURATION_ERROR_STATUS[code]);
      }
      throw err;
    }
  })
  // Create or update a video, refreshing its metadata/snapshot from YouTube as part of the write.
  .post('/', async (c) => {
    const body = videoUpsertSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return errorJson(c, 'invalid_request', 400);
    }
    const input = body.data;
    let metadata: { title: string; channel: string; durationSec: number };
    let viewCount: number;
    try {
      ({ metadata, viewCount } = await fetchVideoForUpsert(input.youtubeId));
    } catch (err) {
      const code = youtubeErrorCode(err);
      if (code) {
        return errorJson(c, code, CURATION_ERROR_STATUS[code]);
      }
      throw err;
    }
    if (input.clipEndSec > metadata.durationSec) {
      return errorJson(c, 'clip_out_of_range', CURATION_ERROR_STATUS.clip_out_of_range);
    }
    const values = {
      title_snapshot: metadata.title,
      channel_snapshot: metadata.channel,
      duration_sec: metadata.durationSec,
      clip_start_sec: input.clipStartSec,
      clip_end_sec: input.clipEndSec,
      view_count_snapshot: viewCount,
      snapshot_refreshed_at: new Date(),
      enabled: input.enabled,
      random_eligible: input.randomEligible,
      notes: input.notes,
    };
    try {
      await db
        .insertInto('videos')
        .values({ youtube_id: input.youtubeId, ...values })
        .onConflict((oc) => oc.column('youtube_id').doUpdateSet(values))
        .execute();
    } catch (err) {
      if (isCheckViolation(err, 'videos_clip_segment_check')) {
        return errorJson(c, 'clip_out_of_range', CURATION_ERROR_STATUS.clip_out_of_range);
      }
      throw err;
    }
    return c.json({ ok: true });
  })
  // Refresh a single video's view-count snapshot. Quota/config errors surface a code; other failures fall
  // back to the stored snapshot and return it as stale rather than erroring.
  .post('/:youtubeId/refresh', async (c) => {
    const youtubeId = c.req.param('youtubeId');
    // Validate the id charset locally (like the sibling routes) before it reaches the YouTube URL, rather
    // than relying on the storage invariant that only validated ids are persisted.
    if (!youtubeIdSchema.safeParse(youtubeId).success) {
      return errorJson(c, 'invalid_request', 400);
    }
    const existing = await db.selectFrom('videos').select('view_count_snapshot').where('youtube_id', '=', youtubeId).executeTakeFirst();
    if (!existing) {
      return errorJson(c, 'video_not_found', CURATION_ERROR_STATUS.video_not_found);
    }
    try {
      const viewCount = await fetchViewCount(youtubeId);
      const snapshotRefreshedAt = new Date();
      await db
        .updateTable('videos')
        .set({ view_count_snapshot: viewCount, snapshot_refreshed_at: snapshotRefreshedAt })
        .where('youtube_id', '=', youtubeId)
        .execute();
      return c.json({ viewCount, snapshotRefreshedAt: snapshotRefreshedAt.toISOString(), stale: false });
    } catch (err) {
      const code = youtubeErrorCode(err);
      if (code) {
        return errorJson(c, code, CURATION_ERROR_STATUS[code]);
      }
      // Any other failure (e.g. a transient network error) falls back to the stored snapshot.
      return c.json({ viewCount: existing.view_count_snapshot, snapshotRefreshedAt: null, stale: true });
    }
  });
