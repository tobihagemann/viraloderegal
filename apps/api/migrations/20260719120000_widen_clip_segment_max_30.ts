import { type Kysely, sql } from 'kysely';

// Widen the videos clip-segment ceiling; mirrors CLIP_MAX_DURATION_SEC in shared.
export const up = async (db: Kysely<any>): Promise<void> => {
  await db.schema.alterTable('videos').dropConstraint('videos_clip_segment_check').execute();
  await db.schema
    .alterTable('videos')
    .addCheckConstraint(
      'videos_clip_segment_check',
      sql`clip_end_sec > clip_start_sec and clip_end_sec - clip_start_sec between 3 and 30 and (duration_sec is null or clip_end_sec <= duration_sec)`,
    )
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  await db.schema.alterTable('videos').dropConstraint('videos_clip_segment_check').execute();
  await db.schema
    .alterTable('videos')
    .addCheckConstraint(
      'videos_clip_segment_check',
      sql`clip_end_sec > clip_start_sec and clip_end_sec - clip_start_sec between 3 and 15 and (duration_sec is null or clip_end_sec <= duration_sec)`,
    )
    .execute();
};
