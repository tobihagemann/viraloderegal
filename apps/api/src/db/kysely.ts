import type { GameSource, GameStatus, RoomStatus, RoundPhase, RoundState } from '@viraloderegal/shared';
import { type ColumnType, type Generated, Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import { env } from '../env.js';

// BIGINT (int8) columns here hold view counts and guesses bounded well under Number.MAX_SAFE_INTEGER,
// so parse them as JS numbers (pg's default is a string) to match the shared scoring helpers and zod
// schemas, which model these gameplay values as numbers.
types.setTypeParser(types.builtins.INT8, Number);

// Selectable as Date; insertable/updatable accept Date or ISO string. The generated variant also lets
// inserts omit the column so the DB default applies.
type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null, Date | string | null>;

export interface RoomsTable {
  id: Generated<string>;
  code: string;
  active_game_id: string | null;
  status: Generated<RoomStatus>;
  created_at: GeneratedTimestamp;
}

export interface GamesTable {
  id: Generated<string>;
  room_id: string;
  game_no: number;
  source: GameSource;
  curated_set_id: string | null;
  rounds_total: number;
  guess_timer_sec: number;
  active_round_id: string | null;
  status: Generated<GameStatus>;
  created_at: GeneratedTimestamp;
}

export interface PlayersTable {
  id: Generated<string>;
  room_id: string;
  name: string;
  join_order: number;
  ip: string;
  is_host: Generated<boolean>;
  session_token: string;
  sound_activated: Generated<boolean>;
  disconnected_at: NullableTimestamp;
  created_at: GeneratedTimestamp;
}

export interface RoundsTable {
  id: Generated<string>;
  game_id: string;
  round_no: number | null;
  youtube_id: string;
  clip_start_sec: number;
  clip_end_sec: number;
  view_count_snapshot: number | null;
  current_phase: Generated<RoundPhase>;
  phase_end_at: NullableTimestamp;
  state: Generated<RoundState>;
  created_at: GeneratedTimestamp;
}

export interface GuessesTable {
  id: Generated<string>;
  round_id: string;
  player_id: string;
  guess: number;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// player_id is set NULL on player removal so the snapshotted name/guess survive mid-game disconnects,
// kicks, and bans for the final per-round table.
export interface RoundScoresTable {
  round_id: string;
  player_id: string | null;
  player_name: string;
  guess: number | null;
  distance: number | null;
  points: Generated<number>;
  is_winner: Generated<boolean>;
}

export interface BannedIpsTable {
  room_id: string;
  ip: string;
}

export interface VideosTable {
  youtube_id: string;
  title_snapshot: string | null;
  channel_snapshot: string | null;
  duration_sec: number | null;
  clip_start_sec: number;
  clip_end_sec: number;
  view_count_snapshot: number | null;
  snapshot_refreshed_at: NullableTimestamp;
  enabled: Generated<boolean>;
  random_eligible: Generated<boolean>;
  notes: string | null;
}

export interface CuratedSetsTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  video_order: Generated<string[]>;
  enabled: Generated<boolean>;
}

export type DB = {
  rooms: RoomsTable;
  games: GamesTable;
  players: PlayersTable;
  rounds: RoundsTable;
  guesses: GuessesTable;
  round_scores: RoundScoresTable;
  banned_ips: BannedIpsTable;
  videos: VideosTable;
  curated_sets: CuratedSetsTable;
};

// pg.Pool connects lazily (first query), so constructing it at module load lets /health boot without a reachable database.
// Exported so the auth layer reuses this single Pool (the API is the only DB client).
export const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
});

export async function closeDb(): Promise<void> {
  await db.destroy();
}
