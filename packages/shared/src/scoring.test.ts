import { describe, expect, it } from 'vitest';
import { guessDistance, scoreRound } from './scoring.js';

describe('guessDistance', () => {
  it('is the absolute difference from the view count', () => {
    expect(guessDistance(100, 130)).toBe(30);
    expect(guessDistance(150, 130)).toBe(20);
  });
});

describe('scoreRound', () => {
  it('awards the point to the single closest guess', () => {
    const scores = scoreRound(
      [
        { playerName: 'Alice', guess: 100 },
        { playerName: 'Bob', guess: 150 },
      ],
      130,
    );
    expect(scores).toEqual([
      { playerName: 'Alice', guess: 100, distance: 30, points: 0, isWinner: false },
      { playerName: 'Bob', guess: 150, distance: 20, points: 1, isWinner: true },
    ]);
  });

  it('shares the point among tied closest guesses', () => {
    const scores = scoreRound(
      [
        { playerName: 'Alice', guess: 120 },
        { playerName: 'Bob', guess: 140 },
        { playerName: 'Carol', guess: 200 },
      ],
      130,
    );
    expect(scores.find((s) => s.playerName === 'Alice')?.points).toBe(1);
    expect(scores.find((s) => s.playerName === 'Bob')?.points).toBe(1);
    expect(scores.find((s) => s.playerName === 'Carol')?.points).toBe(0);
  });

  it('scores a missing guess as 0 with a null distance', () => {
    const scores = scoreRound(
      [
        { playerName: 'Alice', guess: null },
        { playerName: 'Bob', guess: 140 },
      ],
      130,
    );
    expect(scores[0]).toEqual({
      playerName: 'Alice',
      guess: null,
      distance: null,
      points: 0,
      isWinner: false,
    });
    expect(scores[1]?.isWinner).toBe(true);
  });

  it('awards no points when nobody guessed', () => {
    const scores = scoreRound([{ playerName: 'Alice', guess: null }], 130);
    expect(scores.every((s) => s.points === 0 && !s.isWinner)).toBe(true);
  });
});
