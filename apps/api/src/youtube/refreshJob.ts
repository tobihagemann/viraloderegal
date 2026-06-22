import { sql } from 'kysely';
import { db } from '../db/kysely.js';
import { fetchViewCount, isQuotaExhausted, YouTubeQuotaError } from './client.js';
import { NIGHTLY_REFRESH_BATCH, NIGHTLY_REFRESH_INTERVAL_MS, SNAPSHOT_TTL_MS } from './constants.js';

// Periodic snapshot refresh, modeled on the room cleanup sweep: a module-scoped interval with start/stop
// exports and a try/catch tick that tolerates an unreachable database. The interval fires ~every 24h since
// process boot (not wall-clock midnight — there is no cron in this stack), keeping snapshots fresh so the
// loop-time stale path is rare.
let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startRefreshJob(): void {
  if (refreshInterval) {
    return;
  }
  refreshInterval = setInterval(() => {
    void refreshTick();
  }, NIGHTLY_REFRESH_INTERVAL_MS);
}

export function stopRefreshJob(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

async function refreshTick(): Promise<void> {
  // Bail before any DB read while the shared quota backoff holds: a tick now would only re-confirm it.
  if (isQuotaExhausted()) {
    return;
  }
  try {
    const staleCutoff = new Date(Date.now() - SNAPSHOT_TTL_MS);
    const stale = await db
      .selectFrom('videos')
      .select('youtube_id')
      .where('random_eligible', '=', true)
      .where((eb) => eb.or([eb('snapshot_refreshed_at', 'is', null), eb('snapshot_refreshed_at', '<', staleCutoff)]))
      .orderBy('snapshot_refreshed_at', sql`asc nulls first`)
      .limit(NIGHTLY_REFRESH_BATCH)
      .execute();
    for (const video of stale) {
      try {
        const viewCount = await fetchViewCount(video.youtube_id);
        await db
          .updateTable('videos')
          .set({ view_count_snapshot: viewCount, snapshot_refreshed_at: new Date() })
          .where('youtube_id', '=', video.youtube_id)
          .execute();
      } catch (err) {
        // The first quota-exhausted response stops the batch; the backoff bails the next tick. Other failures
        // (a removed id, transient network) leave the existing snapshot and skip just that video.
        if (err instanceof YouTubeQuotaError) {
          break;
        }
      }
    }
  } catch (err) {
    console.error('Snapshot refresh skipped (database unreachable):', err);
  }
}
