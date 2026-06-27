import { env } from '../env.js';
import { CREATE_RATE_LIMIT, GUESS_RATE_WINDOW_MS, GUESS_UPDATES_PER_SEC, JOIN_RATE_LIMIT, RATE_WINDOW_MS } from './constants.js';

// In-memory sliding window. Each bucket keeps a separate allowance so one cannot exhaust another's; the
// per-IP create/join/wsjoin buckets and the per-player guess bucket coexist here. `now` is injectable so the
// window can be exercised deterministically in tests.
type Bucket = 'join' | 'create' | 'guess' | 'wsjoin';
const hits = new Map<string, number[]>();

// A one-off IP would otherwise leave its bucket in the map forever. Sweep fully-expired buckets every so
// many calls (counter-based rather than a timer, so the event loop is not pinned and tests stay simple).
const SWEEP_EVERY_CALLS = 1000;
let callsSinceSweep = 0;

function sweepExpired(cutoff: number): void {
  for (const [key, timestamps] of hits) {
    if (timestamps.every((t) => t <= cutoff)) {
      hits.delete(key);
    }
  }
}

function checkRateLimit(bucket: Bucket, id: string, limit: number, windowMs: number, now: number): boolean {
  // Sweep on the widest window so a bucket is only GC'd once expired for every limiter sharing the map.
  if (++callsSinceSweep >= SWEEP_EVERY_CALLS) {
    callsSinceSweep = 0;
    sweepExpired(now - RATE_WINDOW_MS);
  }
  const cutoff = now - windowMs;
  const key = `${bucket}:${id}`;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function checkJoinRateLimit(ip: string, now: number = Date.now()): boolean {
  return checkRateLimit('join', ip, JOIN_RATE_LIMIT, RATE_WINDOW_MS, now);
}

export function checkCreateRateLimit(ip: string, now: number = Date.now()): boolean {
  return checkRateLimit('create', ip, CREATE_RATE_LIMIT, RATE_WINDOW_MS, now);
}

export function checkWsJoinRateLimit(ip: string, now: number = Date.now()): boolean {
  return checkRateLimit('wsjoin', ip, env.WS_JOIN_RATE_LIMIT, RATE_WINDOW_MS, now);
}

export function checkGuessRateLimit(playerId: string, now: number = Date.now()): boolean {
  return checkRateLimit('guess', playerId, GUESS_UPDATES_PER_SEC, GUESS_RATE_WINDOW_MS, now);
}
