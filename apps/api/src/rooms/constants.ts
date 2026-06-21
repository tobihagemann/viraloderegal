// Server-only operational values for the room lifecycle. Cross-side constants the client also enforces
// live in @viraloderegal/shared; these never leave the server.

/** Per-IP requests allowed within the sliding window before the limiter rejects. */
export const JOIN_RATE_LIMIT = 10;
export const CREATE_RATE_LIMIT = 5;
export const RATE_WINDOW_MS = 60_000;

/** Per-player guess updates allowed per second; last-write-wins absorbs the rest. */
export const GUESS_UPDATES_PER_SEC = 5;
export const GUESS_RATE_WINDOW_MS = 1_000;

/** How many fresh room codes createRoom tries before giving up on the unique-code retry. */
export const ROOM_CODE_MAX_ATTEMPTS = 10;

/** A room is swept this long after creation. The warning fires within the final lead window before that,
 * and the sweep ticks finer than the lead so the warning window is never missed. */
export const ROOM_LIFETIME_MS = 60 * 60_000;
export const ROOM_WARNING_LEAD_MS = 60_000;
export const CLEANUP_SWEEP_INTERVAL_MS = 30_000;
