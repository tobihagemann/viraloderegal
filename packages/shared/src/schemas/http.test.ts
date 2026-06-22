import { describe, expect, it } from 'vitest';
import { curatedSetUpsertSchema, gameSettingsSchema, roomCodeSchema, videoUpsertSchema } from './http.js';

describe('roomCodeSchema', () => {
  it('trims and uppercases a 6-character code', () => {
    expect(roomCodeSchema.parse('  abcde2  ')).toBe('ABCDE2');
  });

  it('rejects codes that are not exactly 6 characters', () => {
    expect(roomCodeSchema.safeParse('ABC12').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABCDE23').success).toBe(false);
  });
});

describe('gameSettingsSchema', () => {
  it('accepts an on-list source, round count, and timer', () => {
    expect(gameSettingsSchema.parse({ source: 'random', roundsTotal: 5, guessTimerSec: 30 })).toEqual({
      source: 'random',
      roundsTotal: 5,
      guessTimerSec: 30,
    });
  });

  it('rejects an off-list round count', () => {
    expect(gameSettingsSchema.safeParse({ source: 'random', roundsTotal: 4, guessTimerSec: 30 }).success).toBe(false);
  });

  it('rejects an off-list guess timer', () => {
    expect(gameSettingsSchema.safeParse({ source: 'random', roundsTotal: 5, guessTimerSec: 25 }).success).toBe(false);
  });

  it('rejects an unknown source', () => {
    expect(gameSettingsSchema.safeParse({ source: 'curated', roundsTotal: 5, guessTimerSec: 30 }).success).toBe(false);
  });

  it('requires a curatedSetId for a set source and accepts a placeholder round count', () => {
    expect(gameSettingsSchema.safeParse({ source: 'set', roundsTotal: 5, guessTimerSec: 30 }).success).toBe(false);
    expect(
      gameSettingsSchema.safeParse({ source: 'set', roundsTotal: 5, guessTimerSec: 30, curatedSetId: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
  });

  it('forbids a curatedSetId for the random source', () => {
    expect(
      gameSettingsSchema.safeParse({ source: 'random', roundsTotal: 5, guessTimerSec: 30, curatedSetId: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(false);
  });
});

describe('videoUpsertSchema', () => {
  const base = { youtubeId: 'dQw4w9WgXcQ', clipStartSec: 10, clipEndSec: 16, enabled: true, randomEligible: true, notes: null };

  it('accepts a segment at the minimum and maximum lengths', () => {
    expect(videoUpsertSchema.safeParse({ ...base, clipStartSec: 10, clipEndSec: 13 }).success).toBe(true);
    expect(videoUpsertSchema.safeParse({ ...base, clipStartSec: 10, clipEndSec: 22 }).success).toBe(true);
  });

  it('rejects a segment shorter than 3s or longer than 12s', () => {
    expect(videoUpsertSchema.safeParse({ ...base, clipStartSec: 10, clipEndSec: 12 }).success).toBe(false);
    expect(videoUpsertSchema.safeParse({ ...base, clipStartSec: 10, clipEndSec: 23 }).success).toBe(false);
  });

  it('rejects an id that is not 11 characters or uses an off-alphabet character', () => {
    expect(videoUpsertSchema.safeParse({ ...base, youtubeId: 'short' }).success).toBe(false);
    expect(videoUpsertSchema.safeParse({ ...base, youtubeId: 'abc&def=123' }).success).toBe(false);
  });
});

describe('curatedSetUpsertSchema', () => {
  it('requires a name and at least one video id', () => {
    expect(curatedSetUpsertSchema.safeParse({ name: 'Set', description: null, videoOrder: ['dQw4w9WgXcQ'], enabled: true }).success).toBe(true);
    expect(curatedSetUpsertSchema.safeParse({ name: '', description: null, videoOrder: ['dQw4w9WgXcQ'], enabled: true }).success).toBe(false);
    expect(curatedSetUpsertSchema.safeParse({ name: 'Set', description: null, videoOrder: [], enabled: true }).success).toBe(false);
  });

  it('rejects duplicate video ids', () => {
    expect(curatedSetUpsertSchema.safeParse({ name: 'Set', description: null, videoOrder: ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'], enabled: true }).success).toBe(false);
  });
});
