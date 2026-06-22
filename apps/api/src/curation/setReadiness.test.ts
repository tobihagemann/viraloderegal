import { describe, expect, it } from 'vitest';
import { findUnreadyVideos, type SetVideoState } from './setReadiness.js';

const ready: SetVideoState = { enabled: true, viewCountSnapshot: 1000 };

describe('findUnreadyVideos', () => {
  it('returns nothing when every member is enabled with a snapshot', () => {
    const byId = new Map([
      ['aaaaaaaaaaa', ready],
      ['bbbbbbbbbbb', ready],
    ]);
    expect(findUnreadyVideos(['aaaaaaaaaaa', 'bbbbbbbbbbb'], byId)).toEqual([]);
  });

  it('flags missing, disabled, and snapshot-less members in order', () => {
    const byId = new Map<string, SetVideoState>([
      ['aaaaaaaaaaa', ready],
      ['bbbbbbbbbbb', { enabled: false, viewCountSnapshot: 1000 }],
      ['ccccccccccc', { enabled: true, viewCountSnapshot: null }],
    ]);
    expect(findUnreadyVideos(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'], byId)).toEqual(['bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd']);
  });
});
