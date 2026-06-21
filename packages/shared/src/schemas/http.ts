import { z } from 'zod';
import { GAME_SOURCES, GUESS_TIMER_OPTIONS_SEC, ROOM_CODE_LENGTH, ROUNDS_TOTAL_OPTIONS } from '../constants.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const roomCodeSchema = z.string().trim().toUpperCase().length(ROOM_CODE_LENGTH);

/** Game-wide settings chosen once by the host before starting. */
export const gameSettingsSchema = z.object({
  source: z.enum(GAME_SOURCES),
  roundsTotal: z
    .number()
    .int()
    .refine((n) => (ROUNDS_TOTAL_OPTIONS as readonly number[]).includes(n)),
  guessTimerSec: z
    .number()
    .int()
    .refine((n) => (GUESS_TIMER_OPTIONS_SEC as readonly number[]).includes(n)),
});
export type GameSettings = z.infer<typeof gameSettingsSchema>;

export const createRoomRequestSchema = z.object({
  name: z.string(),
});
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

export const createRoomResponseSchema = z.object({
  code: roomCodeSchema,
  sessionToken: z.string(),
});
export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;

export const joinRoomRequestSchema = z.object({
  code: roomCodeSchema,
  name: z.string(),
});
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;

export const joinRoomResponseSchema = z.object({
  sessionToken: z.string(),
});
export type JoinRoomResponse = z.infer<typeof joinRoomResponseSchema>;
