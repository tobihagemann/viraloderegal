// Server-only operational values for YouTube snapshot refresh. Cross-side constants the client also enforces
// live in @viraloderegal/shared; these never leave the server.

/** A view-count snapshot older than this is refreshed before use (loop-time resolve and the nightly job). */
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

/** Videos refreshed per nightly run — a conservative default well under the free 10k-unit/day quota. */
export const NIGHTLY_REFRESH_BATCH = 20;

/** The nightly refresh ticks this often since process boot (not wall-clock midnight — there is no cron here). */
export const NIGHTLY_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Cooldown before retrying after a quota-exhausted response, re-armed on each fresh 403. The Data API quota
 * resets at midnight Pacific and a 403 carries no reset time, so a fixed conservative backoff is used rather
 * than computing the exact reset; it errs toward serving existing snapshots over burning calls. */
export const QUOTA_BACKOFF_MS = 6 * 60 * 60 * 1000;

/** Bound on each outbound videos.list call so a hung request falls back fast (it may run under the room lock). */
export const FETCH_TIMEOUT_MS = 5000;
