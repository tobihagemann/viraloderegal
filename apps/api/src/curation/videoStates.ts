import { db } from '../db/kysely.js';
import type { SetVideoState } from './setReadiness.js';

// Load the readiness-relevant state for a list of video ids, keyed by id, for findUnreadyVideos. The single
// query+map shape that the set routes and the start-time re-validation all need.
export async function loadVideoStates(youtubeIds: string[]): Promise<Map<string, SetVideoState>> {
  if (youtubeIds.length === 0) {
    return new Map();
  }
  const videos = await db.selectFrom('videos').select(['youtube_id', 'enabled', 'view_count_snapshot']).where('youtube_id', 'in', youtubeIds).execute();
  return new Map(videos.map((v) => [v.youtube_id, { enabled: v.enabled, viewCountSnapshot: v.view_count_snapshot }]));
}
