import { z } from 'zod';
import {
  CLIP_MAX_DURATION_SEC,
  CLIP_MIN_DURATION_SEC,
  GAME_SOURCES,
  GUESS_TIMER_OPTIONS_SEC,
  ROOM_CODE_LENGTH,
  ROUNDS_TOTAL_OPTIONS,
  YOUTUBE_ID_LENGTH,
} from '../constants.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const roomCodeSchema = z.string().trim().toUpperCase().length(ROOM_CODE_LENGTH);

/** Game-wide settings chosen once by the host before starting. */
export const gameSettingsSchema = z
  .object({
    source: z.enum(GAME_SOURCES),
    // Always required and restricted to the menu options for both sources. A curated-set start sends a valid
    // placeholder (e.g. DEFAULT_ROUNDS_TOTAL) purely to satisfy validation; the server ignores it and derives
    // the real round count from the set length. Keep this required — making it optional would break the random
    // path and the host form's gameSettingsSchema.parse.
    roundsTotal: z
      .number()
      .int()
      .refine((n) => (ROUNDS_TOTAL_OPTIONS as readonly number[]).includes(n)),
    guessTimerSec: z
      .number()
      .int()
      .refine((n) => (GUESS_TIMER_OPTIONS_SEC as readonly number[]).includes(n)),
    curatedSetId: z.uuid().optional(),
  })
  // A set source carries the chosen set's id; the random source must not. The server re-validates the set at
  // start time regardless.
  .refine((s) => (s.source === 'set' ? s.curatedSetId !== undefined : s.curatedSetId === undefined));
export type GameSettings = z.infer<typeof gameSettingsSchema>;

/** A YouTube id: exactly the URL-safe alphabet, full length. The charset (not just the length) is enforced so
 * a value cannot inject extra query parameters when the server interpolates it into the YouTube API URL. */
export const youtubeIdSchema = z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${YOUTUBE_ID_LENGTH}}$`));

/** Admin upsert for a video; the server fetches/stores metadata and enforces clipEndSec ≤ duration. */
export const videoUpsertSchema = z
  .object({
    youtubeId: youtubeIdSchema,
    clipStartSec: z.number().int().nonnegative(),
    clipEndSec: z.number().int().nonnegative(),
    enabled: z.boolean(),
    randomEligible: z.boolean(),
    notes: z.string().nullable(),
  })
  // The segment must run forward and fall within the shared clip bounds. The clipEndSec ≤ duration arm is
  // enforced server-side against fetched metadata and by the videos CHECK constraint.
  .refine(({ clipStartSec, clipEndSec }) => {
    const length = clipEndSec - clipStartSec;
    return length >= CLIP_MIN_DURATION_SEC && length <= CLIP_MAX_DURATION_SEC;
  });
export type VideoUpsert = z.infer<typeof videoUpsertSchema>;

/** Admin upsert for a curated set; the server enforces a unique name and the all-ready membership rule. */
export const curatedSetUpsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  // Member ids must be unique: a curated game's round count is the order length, but playback skips ids it
  // has already used, so a duplicate would be advertised as a round yet never play (ending the game early).
  videoOrder: z
    .array(youtubeIdSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length),
  enabled: z.boolean(),
});
export type CuratedSetUpsert = z.infer<typeof curatedSetUpsertSchema>;

/** The host-visible set list entry: id, name, and the round count (the set's video_order length). */
export const curatedSetSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  roundCount: z.number().int(),
});
export type CuratedSetSummary = z.infer<typeof curatedSetSummarySchema>;

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
