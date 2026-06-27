import { z } from 'zod';
import { MAX_GUESS, ROOM_STATUSES, ROUND_PHASES } from '../constants.js';
import { WIRE_ERROR_CODES } from '../errorCodes.js';
import { roundScoreSchema, standingSchema } from '../scoring.js';
import { gameSettingsSchema, roomCodeSchema } from './http.js';

// Client → server commands. The server holds all authoritative state; clients only send commands.
export const joinCommandSchema = z.object({
  type: z.literal('join'),
  sessionToken: z.string(),
});

export const setNameCommandSchema = z.object({
  type: z.literal('setName'),
  name: z.string(),
});

export const activateSoundCommandSchema = z.object({
  type: z.literal('activateSound'),
});

export const startCommandSchema = z.object({
  type: z.literal('start'),
  settings: gameSettingsSchema,
});

// A guess is sent live as the player types (draft) and once more when they commit it (final). A final guess
// marks the player ready; the server ends the window early once every connected player is ready.
export const guessCommandSchema = z.object({
  type: z.literal('guess'),
  value: z.number().int().min(0).max(MAX_GUESS),
  final: z.boolean().optional(),
});

export const skipIntermissionCommandSchema = z.object({
  type: z.literal('skipIntermission'),
});

// Host-originated: the authoritative host reports that a clip refused to embed or failed to play. roundId
// names which round failed so a duplicate or stale report is ignored once that round has been replaced.
export const reportClipFailureCommandSchema = z.object({
  type: z.literal('reportClipFailure'),
  roundId: z.uuid(),
});

export const kickCommandSchema = z.object({
  type: z.literal('kick'),
  playerId: z.uuid(),
});

export const banCommandSchema = z.object({
  type: z.literal('ban'),
  playerId: z.uuid(),
});

export const handBackHostCommandSchema = z.object({
  type: z.literal('handBackHost'),
});

export const clientCommandSchema = z.discriminatedUnion('type', [
  joinCommandSchema,
  setNameCommandSchema,
  activateSoundCommandSchema,
  startCommandSchema,
  guessCommandSchema,
  skipIntermissionCommandSchema,
  reportClipFailureCommandSchema,
  kickCommandSchema,
  banCommandSchema,
  handBackHostCommandSchema,
]);
export type ClientCommand = z.infer<typeof clientCommandSchema>;

// Server → client events.
export const phaseEventSchema = z.object({
  type: z.literal('phase'),
  phase: z.enum(ROUND_PHASES),
  phaseEndAt: z.iso.datetime(),
});

// The active round's metadata, shared by the round event and the reconnect snapshot. roundId is the id the
// host echoes back in reportClipFailure to name the failed clip.
export const activeRoundSchema = z.object({
  roundId: z.uuid(),
  roundNo: z.number().int(),
  roundsTotal: z.number().int(),
  youtubeId: z.string(),
  clipStartSec: z.number().int(),
  clipEndSec: z.number().int(),
});

// The round's true view count with each player's per-guess delta and the winner flag, shared by the reveal
// event and the reconnect snapshot. The video's title is part of the revealed answer — withheld until the
// reveal alongside the view count so it can't be looked up during guessing. Null when the source video
// carries no title snapshot.
export const revealPayloadSchema = z.object({
  viewCount: z.number().int(),
  title: z.string().nullable(),
  results: z.array(roundScoreSchema),
});

// Broadcast at each round's clip start so clients play the segment; carries the round metadata and the
// clip phase deadline. Non-clip transitions reuse phaseEventSchema.
export const roundEventSchema = activeRoundSchema.extend({
  type: z.literal('round'),
  phase: z.literal('clip'),
  phaseEndAt: z.iso.datetime(),
});

// The live reveal event: the reveal payload plus its phase deadline.
export const revealEventSchema = revealPayloadSchema.extend({
  type: z.literal('reveal'),
  phaseEndAt: z.iso.datetime(),
});

// The cumulative standings shown on the reveal board between rounds.
export const leaderboardEventSchema = z.object({
  type: z.literal('leaderboard'),
  standings: z.array(standingSchema),
  phaseEndAt: z.iso.datetime(),
});

// A delivered round's result, carried in the end-screen history so late or removed clients can still
// render the per-round table. The reveal payload's title is omitted — the end-screen recap shows view
// counts, not titles.
export const roundResultSchema = revealPayloadSchema.omit({ title: true }).extend({
  roundNo: z.number().int(),
});
export type RoundResult = z.infer<typeof roundResultSchema>;

// The end screen: final standings plus the per-round history.
export const gameOverEventSchema = z.object({
  type: z.literal('gameOver'),
  standings: z.array(standingSchema),
  rounds: z.array(roundResultSchema),
});

// The T-1-minute warning the cleanup sweep emits while players are present.
export const roomWarningEventSchema = z.object({
  type: z.literal('roomWarning'),
  secondsRemaining: z.number().int(),
});

export const errorEventSchema = z.object({
  type: z.literal('error'),
  code: z.enum(WIRE_ERROR_CODES),
  message: z.string(),
});

// A roster entry. `connected` reflects the live socket registry, not the persisted disconnected_at.
export const playerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  joinOrder: z.number().int(),
  isHost: z.boolean(),
  soundActivated: z.boolean(),
  connected: z.boolean(),
});
export type Player = z.infer<typeof playerSchema>;

// The authoritative lobby view sent to clients; `canStart` is the server-computed start-gate.
export const lobbyStateSchema = z.object({
  code: roomCodeSchema,
  status: z.enum(ROOM_STATUSES),
  players: z.array(playerSchema),
  canStart: z.boolean(),
});
export type LobbyState = z.infer<typeof lobbyStateSchema>;

// The authoritative game state a reconnecting socket needs to resume mid-game or land on the end screen.
// Null/absent while the room is still in the lobby. For an active game the phase/round/reveal fields are
// populated; for a finished room they are null and only `standings` + `rounds` (the end-screen history)
// carry data.
export const gameSnapshotSchema = z.object({
  phase: z.enum(ROUND_PHASES).nullable(),
  phaseEndAt: z.iso.datetime().nullable(),
  round: activeRoundSchema.nullable(),
  standings: z.array(standingSchema),
  yourGuess: z.number().int().nullable(),
  reveal: revealPayloadSchema.nullable(),
  rounds: z.array(roundResultSchema),
});
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;

// Full per-socket snapshot sent on (re)connect; `you` is the recipient's own player id. `game` completes
// the reconnect contract when a game is active or finished, and is absent in the lobby.
export const snapshotEventSchema = z.object({
  type: z.literal('snapshot'),
  you: z.uuid(),
  lobby: lobbyStateSchema,
  game: gameSnapshotSchema.nullable().optional(),
});
export type SnapshotEvent = z.infer<typeof snapshotEventSchema>;

// Broadcast to the whole room on any roster/state change.
export const lobbyEventSchema = z.object({
  type: z.literal('lobby'),
  lobby: lobbyStateSchema,
});
export type LobbyEvent = z.infer<typeof lobbyEventSchema>;

// Sent to a removed client just before its socket is closed so it knows why.
export const kickedEventSchema = z.object({
  type: z.literal('kicked'),
  reason: z.enum(['kick', 'ban']),
});
export type KickedEvent = z.infer<typeof kickedEventSchema>;

export const serverEventSchema = z.discriminatedUnion('type', [
  phaseEventSchema,
  roundEventSchema,
  revealEventSchema,
  leaderboardEventSchema,
  gameOverEventSchema,
  roomWarningEventSchema,
  errorEventSchema,
  snapshotEventSchema,
  lobbyEventSchema,
  kickedEventSchema,
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;
