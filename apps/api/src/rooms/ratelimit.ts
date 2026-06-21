import { CREATE_RATE_LIMIT, JOIN_RATE_LIMIT, RATE_WINDOW_MS } from './constants.js';

// In-memory per-IP sliding window. Create and join keep separate buckets so one cannot exhaust the
// other's allowance. `now` is injectable so the window can be exercised deterministically in tests.
type Bucket = 'join' | 'create';
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

function checkRateLimit(bucket: Bucket, ip: string, limit: number, now: number): boolean {
  const cutoff = now - RATE_WINDOW_MS;
  if (++callsSinceSweep >= SWEEP_EVERY_CALLS) {
    callsSinceSweep = 0;
    sweepExpired(cutoff);
  }
  const key = `${bucket}:${ip}`;
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
  return checkRateLimit('join', ip, JOIN_RATE_LIMIT, now);
}

export function checkCreateRateLimit(ip: string, now: number = Date.now()): boolean {
  return checkRateLimit('create', ip, CREATE_RATE_LIMIT, now);
}
