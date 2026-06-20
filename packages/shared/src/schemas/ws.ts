import { z } from 'zod';
import { MAX_GUESS, ROUND_PHASES } from '../constants.js';
import { gameSettingsSchema } from './http.js';

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

export const serverEventSchema = z.discriminatedUnion('type', [phaseEventSchema, errorEventSchema]);
export type ServerEvent = z.infer<typeof serverEventSchema>;
