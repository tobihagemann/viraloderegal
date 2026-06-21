import { describe, expect, it } from 'vitest';
import { computeLeaderboard, guessDistance, scoreRound } from './scoring.js';

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

describe('computeLeaderboard', () => {
  it('sums points per player and orders highest first', () => {
    const standings = computeLeaderboard([
      { playerName: 'Alice', points: 1 },
      { playerName: 'Bob', points: 0 },
      { playerName: 'Alice', points: 1 },
      { playerName: 'Bob', points: 1 },
    ]);
    expect(standings).toEqual([
      { playerName: 'Alice', totalPoints: 2, rank: 1 },
      { playerName: 'Bob', totalPoints: 1, rank: 2 },
    ]);
  });

  it('shares a rank among ties and resumes at the absolute position', () => {
    const standings = computeLeaderboard([
      { playerName: 'Alice', points: 2 },
      { playerName: 'Bob', points: 2 },
      { playerName: 'Carol', points: 1 },
    ]);
    expect(standings.find((s) => s.playerName === 'Alice')?.rank).toBe(1);
    expect(standings.find((s) => s.playerName === 'Bob')?.rank).toBe(1);
    expect(standings.find((s) => s.playerName === 'Carol')?.rank).toBe(3);
  });

  it('ranks zero-point players last', () => {
    const standings = computeLeaderboard([
      { playerName: 'Zoe', points: 0 },
      { playerName: 'Max', points: 1 },
    ]);
    expect(standings[0]).toEqual({ playerName: 'Max', totalPoints: 1, rank: 1 });
    expect(standings[1]).toEqual({ playerName: 'Zoe', totalPoints: 0, rank: 2 });
  });
});
