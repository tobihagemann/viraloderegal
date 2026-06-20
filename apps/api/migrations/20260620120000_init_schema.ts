import { type Kysely, sql } from 'kysely';

// Game schema. Auth tables are managed separately.
export const up = async (db: Kysely<any>): Promise<void> => {
  await sql`create extension if not exists "pgcrypto"`.execute(db);

  await db.schema.createType('room_status').asEnum(['lobby', 'active', 'finished', 'abandoned']).execute();
  await db.schema.createType('game_source').asEnum(['random', 'set']).execute();
  await db.schema.createType('game_status').asEnum(['active', 'finished']).execute();
  await db.schema.createType('round_phase').asEnum(['clip', 'guess', 'reveal_sting', 'reveal_guesses', 'reveal_board', 'inter']).execute();
  await db.schema.createType('round_state').asEnum(['active', 'completed', 'skipped']).execute();

  await db.schema
    .createTable('curated_sets')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('description', 'text')
    .addColumn('video_order', sql`varchar(11)[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .execute();

  // rooms.active_game_id and games.active_round_id form two FK cycles with games and rounds. The columns
  // are created nullable here and the back-reference constraints are added via ALTER once both sides exist.
  await db.schema
    .createTable('rooms')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('code', sql`char(6)`, (col) => col.notNull().unique())
    .addColumn('active_game_id', 'uuid')
    .addColumn('status', sql`room_status`, (col) => col.notNull().defaultTo('lobby'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('games')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('room_id', 'uuid', (col) => col.notNull().references('rooms.id').onDelete('cascade'))
    .addColumn('game_no', 'smallint', (col) => col.notNull())
    .addColumn('source', sql`game_source`, (col) => col.notNull())
    .addColumn('curated_set_id', 'uuid', (col) => col.references('curated_sets.id').onDelete('set null'))
    .addColumn('rounds_total', 'smallint', (col) => col.notNull())
    .addColumn('guess_timer_sec', 'smallint', (col) => col.notNull())
    .addColumn('active_round_id', 'uuid')
    .addColumn('status', sql`game_status`, (col) => col.notNull().defaultTo('active'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('games_room_id_game_no_key', ['room_id', 'game_no'])
    .execute();

  await db.schema
    .createTable('players')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('room_id', 'uuid', (col) => col.notNull().references('rooms.id').onDelete('cascade'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('join_order', 'smallint', (col) => col.notNull())
    .addColumn('ip', sql`inet`, (col) => col.notNull())
    .addColumn('is_host', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('session_token', 'text', (col) => col.notNull().unique())
    .addColumn('sound_activated', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('disconnected_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Functional unique index: case-insensitive name uniqueness within a room.
  await sql`create unique index players_room_id_lower_name_key on players (room_id, lower(name))`.execute(db);

  await db.schema
    .createTable('rounds')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('game_id', 'uuid', (col) => col.notNull().references('games.id').onDelete('cascade'))
    .addColumn('round_no', 'smallint')
    .addColumn('youtube_id', sql`varchar(11)`, (col) => col.notNull())
    .addColumn('clip_start_sec', 'smallint', (col) => col.notNull())
    .addColumn('clip_end_sec', 'smallint', (col) => col.notNull())
    .addColumn('view_count_snapshot', 'bigint')
    .addColumn('current_phase', sql`round_phase`, (col) => col.notNull().defaultTo('clip'))
    .addColumn('phase_end_at', 'timestamptz')
    .addColumn('state', sql`round_state`, (col) => col.notNull().defaultTo('active'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('guesses')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('round_id', 'uuid', (col) => col.notNull().references('rounds.id').onDelete('cascade'))
    .addColumn('player_id', 'uuid', (col) => col.notNull().references('players.id').onDelete('cascade'))
    .addColumn('guess', 'bigint', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('guesses_round_id_player_id_key', ['round_id', 'player_id'])
    .execute();

  // player_id is ON DELETE SET NULL so the snapshotted name/guess survive player removal for the
  // final per-round table.
  await db.schema
    .createTable('round_scores')
    .addColumn('round_id', 'uuid', (col) => col.notNull().references('rounds.id').onDelete('cascade'))
    .addColumn('player_id', 'uuid', (col) => col.references('players.id').onDelete('set null'))
    .addColumn('player_name', 'text', (col) => col.notNull())
    .addColumn('guess', 'bigint')
    .addColumn('distance', 'bigint')
    .addColumn('points', 'smallint', (col) => col.notNull().defaultTo(0))
    .addColumn('is_winner', 'boolean', (col) => col.notNull().defaultTo(false))
    .addPrimaryKeyConstraint('round_scores_pkey', ['round_id', 'player_name'])
    .execute();

  await db.schema
    .createTable('banned_ips')
    .addColumn('room_id', 'uuid', (col) => col.notNull().references('rooms.id').onDelete('cascade'))
    .addColumn('ip', sql`inet`, (col) => col.notNull())
    .addPrimaryKeyConstraint('banned_ips_pkey', ['room_id', 'ip'])
    .execute();

  await db.schema
    .createTable('videos')
    .addColumn('youtube_id', sql`varchar(11)`, (col) => col.primaryKey())
    .addColumn('title_snapshot', 'text')
    .addColumn('channel_snapshot', 'text')
    .addColumn('duration_sec', 'smallint')
    .addColumn('clip_start_sec', 'smallint', (col) => col.notNull())
    .addColumn('clip_end_sec', 'smallint', (col) => col.notNull())
    .addColumn('view_count_snapshot', 'bigint')
    .addColumn('snapshot_refreshed_at', 'timestamptz')
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('random_eligible', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('notes', 'text')
    .addCheckConstraint(
      'videos_clip_segment_check',
      sql`clip_end_sec > clip_start_sec and clip_end_sec - clip_start_sec between 3 and 12 and (duration_sec is null or clip_end_sec <= duration_sec)`,
    )
    .execute();

  await db.schema.createIndex('videos_pool_idx').on('videos').columns(['enabled', 'random_eligible']).execute();

  await db.schema.alterTable('rooms').addForeignKeyConstraint('rooms_active_game_id_fkey', ['active_game_id'], 'games', ['id']).onDelete('set null').execute();
  await db.schema
    .alterTable('games')
    .addForeignKeyConstraint('games_active_round_id_fkey', ['active_round_id'], 'rounds', ['id'])
    .onDelete('set null')
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  for (const table of ['videos', 'banned_ips', 'round_scores', 'guesses', 'rounds', 'players', 'games', 'rooms', 'curated_sets']) {
    await db.schema.dropTable(table).ifExists().cascade().execute();
  }
  for (const type of ['round_state', 'round_phase', 'game_status', 'game_source', 'room_status']) {
    await db.schema.dropType(type).ifExists().execute();
  }
};
