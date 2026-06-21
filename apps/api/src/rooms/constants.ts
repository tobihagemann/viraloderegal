// Server-only operational values for the room lifecycle. Cross-side constants the client also enforces
// live in @viraloderegal/shared; these never leave the server.

/** Per-IP requests allowed within the sliding window before the limiter rejects. */
export const JOIN_RATE_LIMIT = 10;
export const CREATE_RATE_LIMIT = 5;
export const RATE_WINDOW_MS = 60_000;

/** How many fresh room codes createRoom tries before giving up on the unique-code retry. */
export const ROOM_CODE_MAX_ATTEMPTS = 10;
