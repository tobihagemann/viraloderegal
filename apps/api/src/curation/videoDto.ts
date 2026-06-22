import type { Selectable } from 'kysely';
import type { VideosTable } from '../db/kysely.js';

// The camelCase video shape the admin UI consumes, shared by the video list and a set's resolved members.
export interface VideoDto {
  youtubeId: string;
  title: string | null;
  channel: string | null;
  durationSec: number | null;
  clipStartSec: number;
  clipEndSec: number;
  viewCount: number | null;
  snapshotRefreshedAt: string | null;
  enabled: boolean;
  randomEligible: boolean;
  notes: string | null;
}

export function toVideoDto(row: Selectable<VideosTable>): VideoDto {
  return {
    youtubeId: row.youtube_id,
    title: row.title_snapshot,
    channel: row.channel_snapshot,
    durationSec: row.duration_sec,
    clipStartSec: row.clip_start_sec,
    clipEndSec: row.clip_end_sec,
    viewCount: row.view_count_snapshot,
    snapshotRefreshedAt: row.snapshot_refreshed_at ? row.snapshot_refreshed_at.toISOString() : null,
    enabled: row.enabled,
    randomEligible: row.random_eligible,
    notes: row.notes,
  };
}
