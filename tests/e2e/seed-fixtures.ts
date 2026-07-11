import pg from 'pg';

// Seed the dedicated e2e fixtures that the YouTube-dependent specs drive. This is a deliberate, isolated
// second DB touch in test-harness code (the app remains the only DB client at runtime); a migration is the
// wrong vehicle — Kysely records a migration as applied on its first run regardless of what up() did, so an
// env-gated seed can never later populate a reused DB and its results would be environment-dependent. Living
// outside the migration chain, these fixtures never reach production. Runs once as Playwright's globalSetup,
// after CI's migrate step has created the schema. Resolves DATABASE_URL exactly as the webServer entry does.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://viraloderegal:viraloderegal@localhost:5432/viraloderegal';

// Far older than SNAPSHOT_TTL_MS, so resolveFreshSnapshot treats every fixture as stale. The DO UPDATE resets
// it on every run, returning a reused local e2e DB to the stale state the specs require (idempotent).
const STALE_AT = '2020-01-01T00:00:00Z';

// All three are fail-500 fixtures on the fake server (a 500 counts the fetch attempt but never persists a
// fresh timestamp, so they stay stale across CI retries) and random_eligible: false so they never enter the
// random draw. Their stored view counts are the source of truth (the specs mirror these literals):
//   E2EFAILVC01 — branch #1's refresh target: the fake 500s → stored-snapshot fallback returns this count.
//   E2ESTALEA01 — branch #3's control clip: stale, so the game-start fetch fires (and 500s, staying stale).
//   E2ESTALEB02 — branch #3's replacement clip: a clip-failure replacement must NOT fetch it even though it
//                 is stale; the fail-500 keeps a wrongful fetch a visible regression on every retry.
const FIXTURES = [
  { youtube_id: 'E2EFAILVC01', title: 'Fixture Refresh Fallback', view_count: 123_456_789 },
  { youtube_id: 'E2ESTALEA01', title: 'Fixture Stale Control', view_count: 111_111 },
  { youtube_id: 'E2ESTALEB02', title: 'Fixture Stale Replacement', view_count: 222_222 },
];

export default async function globalSetup(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    for (const fixture of FIXTURES) {
      await client.query(
        `insert into videos
           (youtube_id, title_snapshot, channel_snapshot, duration_sec, clip_start_sec, clip_end_sec,
            view_count_snapshot, snapshot_refreshed_at, enabled, random_eligible, notes)
         values ($1, $2, 'Fixture Channel', 100, 10, 20, $3, $4, true, false, null)
         on conflict (youtube_id) do update set
           title_snapshot = excluded.title_snapshot,
           channel_snapshot = excluded.channel_snapshot,
           duration_sec = excluded.duration_sec,
           clip_start_sec = excluded.clip_start_sec,
           clip_end_sec = excluded.clip_end_sec,
           view_count_snapshot = excluded.view_count_snapshot,
           snapshot_refreshed_at = excluded.snapshot_refreshed_at,
           enabled = excluded.enabled,
           random_eligible = excluded.random_eligible,
           notes = excluded.notes`,
        [fixture.youtube_id, fixture.title, fixture.view_count, STALE_AT],
      );
    }
  } finally {
    await client.end();
  }
}
