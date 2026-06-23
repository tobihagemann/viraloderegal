// Cross-side contracts shared by client and server so the two cannot drift.
// Server-only operational values (rate limits, room lifetime, snapshot freshness)
// live with the code that owns them, not here.

/** Room-code alphabet: A–Z excluding the ambiguous I and O, plus digits 2–9. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

/** Roster bounds. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

/** Username normalization/validation bounds. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/**
 * Reserved usernames, rejected case-insensitively after normalization.
 * Compared against the lowercased, normalized name.
 */
export const RESERVED_USERNAMES = ['host', 'admin', 'system', 'server', 'moderator', 'spielleitung', 'bot', 'ai', 'gpt', 'chatgpt', 'claude'] as const;

/** Selectable guess-timer durations in seconds; 30 is the default. */
export const GUESS_TIMER_OPTIONS_SEC = [15, 30, 45, 60] as const;
export const DEFAULT_GUESS_TIMER_SEC = 30;
export type GuessTimerSec = (typeof GUESS_TIMER_OPTIONS_SEC)[number];

/** Selectable round counts; 5 is the default. */
export const ROUNDS_TOTAL_OPTIONS = [3, 5, 7, 9] as const;
export const DEFAULT_ROUNDS_TOTAL = 5;
export type RoundsTotal = (typeof ROUNDS_TOTAL_OPTIONS)[number];

/** Reveal sub-phase and pacing durations in seconds: a brief suspense sting, then longer windows to read
 * the per-guess results and the updated leaderboard. */
export const REVEAL_STING_SEC = 3;
export const REVEAL_GUESSES_SEC = 8;
export const REVEAL_BOARD_SEC = 5;
export const INTERMISSION_SEC = 30;

/** Reconnect grace window in seconds before a dropped player is removed. */
export const RECONNECT_GRACE_SEC = 45;

/** A YouTube video id is always 11 characters; mirrored by the videos table's varchar(11) columns. */
export const YOUTUBE_ID_LENGTH = 11;

/**
 * Clip-segment bounds in seconds. The admin "Clip testen" preview validates
 * client-side and the videos CHECK constraint enforces server-side.
 */
export const CLIP_MIN_DURATION_SEC = 3;
export const CLIP_MAX_DURATION_SEC = 15;

/**
 * Upper bound for a guess. The client validates input live and the server
 * bounds the accepted value to the same ceiling.
 */
export const MAX_GUESS = Number.MAX_SAFE_INTEGER;

export const ROOM_STATUSES = ['lobby', 'active', 'finished', 'abandoned'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const GAME_SOURCES = ['random', 'set'] as const;
export type GameSource = (typeof GAME_SOURCES)[number];

export const GAME_STATUSES = ['active', 'finished'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const ROUND_PHASES = ['clip', 'guess', 'reveal_sting', 'reveal_guesses', 'reveal_board', 'inter'] as const;
export type RoundPhase = (typeof ROUND_PHASES)[number];

export const ROUND_STATES = ['active', 'completed', 'skipped'] as const;
export type RoundState = (typeof ROUND_STATES)[number];
