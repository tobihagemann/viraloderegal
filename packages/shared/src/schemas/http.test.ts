import { describe, expect, it } from 'vitest';
import { gameSettingsSchema, roomCodeSchema } from './http.js';

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
});
