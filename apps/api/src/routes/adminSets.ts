import { curatedSetUpsertSchema, type WireErrorCode } from '@viraloderegal/shared';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAdmin.js';
import { errorJson } from '../http/errorResponse.js';
import { findUnreadyVideos, type SetVideoState } from '../curation/setReadiness.js';
import { loadVideoStates } from '../curation/videoStates.js';
import { toVideoDto } from '../curation/videoDto.js';
import { isUniqueViolation } from '../db/constraints.js';
import { db } from '../db/kysely.js';

type SetError = 'set_name_taken' | 'set_incomplete' | 'set_not_found';

const SET_ERROR_STATUS: Record<SetError, ContentfulStatusCode> = {
  set_name_taken: 409,
  set_incomplete: 422,
  set_not_found: 404,
};

// An optional id turns the create-form contract into an upsert: present updates that set (rename included),
// absent inserts a new one. The shared schema stays id-free (a cross-side create payload); the id is a
// server-side edit concern.
const setUpsertRequestSchema = curatedSetUpsertSchema.extend({ id: z.uuid().optional() });

export const adminSets = new Hono()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const sets = await db.selectFrom('curated_sets').select(['id', 'name', 'description', 'video_order', 'enabled']).orderBy('name').execute();
    const referencedIds = [...new Set(sets.flatMap((s) => s.video_order))];
    const videos = referencedIds.length ? await db.selectFrom('videos').selectAll().where('youtube_id', 'in', referencedIds).execute() : [];
    const videoById = new Map(videos.map((v) => [v.youtube_id, v]));
    const stateById = new Map<string, SetVideoState>(videos.map((v) => [v.youtube_id, { enabled: v.enabled, viewCountSnapshot: v.view_count_snapshot }]));
    return c.json({
      sets: sets.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        enabled: s.enabled,
        videoOrder: s.video_order,
        videos: s.video_order
          .map((id) => videoById.get(id))
          .filter((v) => v !== undefined)
          .map(toVideoDto),
        unreadyVideos: findUnreadyVideos(s.video_order, stateById),
      })),
    });
  })
  // Create or update a set. Enforces a unique name and, when enabled, the all-ready membership rule (every
  // member exists, is enabled, and has a snapshot).
  .post('/', async (c) => {
    const body = setUpsertRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return errorJson(c, 'invalid_request', 400);
    }
    const input = body.data;
    if (input.enabled) {
      const unready = findUnreadyVideos(input.videoOrder, await loadVideoStates(input.videoOrder));
      if (unready.length > 0) {
        return c.json({ code: 'set_incomplete' satisfies WireErrorCode, videos: unready }, SET_ERROR_STATUS.set_incomplete);
      }
    }
    const values = { name: input.name, description: input.description, video_order: input.videoOrder, enabled: input.enabled };
    try {
      if (input.id) {
        const result = await db.updateTable('curated_sets').set(values).where('id', '=', input.id).executeTakeFirst();
        if (result.numUpdatedRows === 0n) {
          return errorJson(c, 'set_not_found', SET_ERROR_STATUS.set_not_found);
        }
      } else {
        await db.insertInto('curated_sets').values(values).execute();
      }
    } catch (err) {
      if (isUniqueViolation(err, 'curated_sets_name_key')) {
        return errorJson(c, 'set_name_taken', SET_ERROR_STATUS.set_name_taken);
      }
      throw err;
    }
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    await db.deleteFrom('curated_sets').where('id', '=', c.req.param('id')).execute();
    return c.json({ ok: true });
  });
