import type { CuratedSetSummary } from '@viraloderegal/shared';
import { Hono } from 'hono';
import { findUnreadyVideos } from '../curation/setReadiness.js';
import { loadVideoStates } from '../curation/videoStates.js';
import { db } from '../db/kysely.js';

// Public, read-only set list for the host's start menu (hosts are anonymous connection-bound clients with no
// better-auth session, so they cannot call the requireAdmin-gated /admin/sets). Returns only enabled AND
// ready sets so a host cannot pick one that would fail at start; exposes only id/name/roundCount, never view
// counts, so no answer leaks.
export const sets = new Hono().get('/', async (c) => {
  const all = await db.selectFrom('curated_sets').select(['id', 'name', 'video_order']).where('enabled', '=', true).orderBy('name').execute();
  const stateById = await loadVideoStates([...new Set(all.flatMap((s) => s.video_order))]);
  const ready = all
    .filter((s) => s.video_order.length > 0 && findUnreadyVideos(s.video_order, stateById).length === 0)
    .map((s) => ({ id: s.id, name: s.name, roundCount: s.video_order.length }) satisfies CuratedSetSummary);
  return c.json(ready);
});
