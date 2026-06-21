import { z } from 'zod';
import { MAX_GUESS, ROOM_STATUSES, ROUND_PHASES } from '../constants.js';
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

export const guessCommandSchema = z.object({
  type: z.literal('guess'),
  value: z.number().int().min(0).max(MAX_GUESS),
});

export const skipIntermissionCommandSchema = z.object({
  type: z.literal('skipIntermission'),
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

export const errorEventSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
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

// Full per-socket snapshot sent on (re)connect; `you` is the recipient's own player id.
export const snapshotEventSchema = z.object({
  type: z.literal('snapshot'),
  you: z.uuid(),
  lobby: lobbyStateSchema,
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

export const serverEventSchema = z.discriminatedUnion('type', [phaseEventSchema, errorEventSchema, snapshotEventSchema, lobbyEventSchema, kickedEventSchema]);
export type ServerEvent = z.infer<typeof serverEventSchema>;
