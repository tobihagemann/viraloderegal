import { type Kysely, sql } from 'kysely';

// Seed a minimal random pool. Idempotent via ON CONFLICT. Stale snapshots are fine: eligibility needs
// only a non-NULL view_count_snapshot, not a fresh one.
const VIDEOS = [
  {
    youtube_id: 'dQw4w9WgXcQ',
    title_snapshot: 'Never Gonna Give You Up',
    channel_snapshot: 'Rick Astley',
    duration_sec: 213,
    clip_start_sec: 43,
    clip_end_sec: 53,
    view_count_snapshot: 1_600_000_000,
  },
  {
    youtube_id: '9bZkp7q19f0',
    title_snapshot: 'Gangnam Style',
    channel_snapshot: 'officialpsy',
    duration_sec: 253,
    clip_start_sec: 60,
    clip_end_sec: 70,
    view_count_snapshot: 5_200_000_000,
  },
  {
    youtube_id: 'kJQP7kiw5Fk',
    title_snapshot: 'Despacito',
    channel_snapshot: 'Luis Fonsi',
    duration_sec: 282,
    clip_start_sec: 75,
    clip_end_sec: 84,
    view_count_snapshot: 8_500_000_000,
  },
  {
    youtube_id: 'OPf0YbXqDm0',
    title_snapshot: 'Uptown Funk',
    channel_snapshot: 'Mark Ronson',
    duration_sec: 270,
    clip_start_sec: 90,
    clip_end_sec: 99,
    view_count_snapshot: 5_000_000_000,
  },
  {
    youtube_id: 'JGwWNGJdvx8',
    title_snapshot: 'Shape of You',
    channel_snapshot: 'Ed Sheeran',
    duration_sec: 263,
    clip_start_sec: 50,
    clip_end_sec: 59,
    view_count_snapshot: 6_200_000_000,
  },
  {
    youtube_id: 'hT_nvWreIhg',
    title_snapshot: 'Counting Stars',
    channel_snapshot: 'OneRepublic',
    duration_sec: 258,
    clip_start_sec: 30,
    clip_end_sec: 39,
    view_count_snapshot: 4_100_000_000,
  },
  {
    youtube_id: 'CevxZvSJLk8',
    title_snapshot: 'Roar',
    channel_snapshot: 'Katy Perry',
    duration_sec: 270,
    clip_start_sec: 45,
    clip_end_sec: 54,
    view_count_snapshot: 3_900_000_000,
  },
  {
    youtube_id: 'fJ9rUzIMcZQ',
    title_snapshot: 'Bohemian Rhapsody',
    channel_snapshot: 'Queen',
    duration_sec: 360,
    clip_start_sec: 120,
    clip_end_sec: 130,
    view_count_snapshot: 1_800_000_000,
  },
];

export const up = async (db: Kysely<any>): Promise<void> => {
  await db
    .insertInto('videos')
    .values(VIDEOS.map((video) => ({ ...video, snapshot_refreshed_at: sql`now()` })))
    .onConflict((oc) => oc.column('youtube_id').doNothing())
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  await db
    .deleteFrom('videos')
    .where(
      'youtube_id',
      'in',
      VIDEOS.map((video) => video.youtube_id),
    )
    .execute();
};
