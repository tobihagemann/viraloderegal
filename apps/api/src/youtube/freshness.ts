import { SNAPSHOT_TTL_MS } from './constants.js';

// Whether a stored view-count snapshot is recent enough to use as-is (vs. refreshing it before a round).
// Pure so the TTL boundary unit-tests without a clock or database.
export function isSnapshotFresh(refreshedAt: Date | null, now: number): boolean {
  return refreshedAt !== null && now - refreshedAt.getTime() < SNAPSHOT_TTL_MS;
}
