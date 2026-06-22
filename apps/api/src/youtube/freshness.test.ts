import { describe, expect, it } from 'vitest';
import { isSnapshotFresh } from './freshness.js';
import { SNAPSHOT_TTL_MS } from './constants.js';

describe('isSnapshotFresh', () => {
  const now = 1_000_000_000_000;

  it('treats a null snapshot as not fresh', () => {
    expect(isSnapshotFresh(null, now)).toBe(false);
  });

  it('is fresh just inside the TTL and stale at or past it', () => {
    expect(isSnapshotFresh(new Date(now - (SNAPSHOT_TTL_MS - 1)), now)).toBe(true);
    expect(isSnapshotFresh(new Date(now - SNAPSHOT_TTL_MS), now)).toBe(false);
    expect(isSnapshotFresh(new Date(now - (SNAPSHOT_TTL_MS + 1)), now)).toBe(false);
  });
});
