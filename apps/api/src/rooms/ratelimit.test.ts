import { describe, expect, it } from 'vitest';
import { env } from '../env.js';
import { CREATE_RATE_LIMIT, GUESS_RATE_WINDOW_MS, GUESS_UPDATES_PER_SEC, JOIN_RATE_LIMIT, RATE_WINDOW_MS } from './constants.js';
import { checkCreateRateLimit, checkGuessRateLimit, checkJoinRateLimit, checkWsJoinRateLimit } from './ratelimit.js';

describe('checkJoinRateLimit', () => {
  it('allows up to the limit within the window then rejects', () => {
    const ip = '203.0.113.1';
    const now = 1_000_000;
    for (let i = 0; i < JOIN_RATE_LIMIT; i++) {
      expect(checkJoinRateLimit(ip, now)).toBe(true);
    }
    expect(checkJoinRateLimit(ip, now)).toBe(false);
  });

  it('prunes entries older than the window so later joins are allowed again', () => {
    const ip = '203.0.113.2';
    const start = 2_000_000;
    for (let i = 0; i < JOIN_RATE_LIMIT; i++) {
      checkJoinRateLimit(ip, start);
    }
    expect(checkJoinRateLimit(ip, start)).toBe(false);
    expect(checkJoinRateLimit(ip, start + RATE_WINDOW_MS + 1)).toBe(true);
  });
});

describe('checkCreateRateLimit', () => {
  it('keeps a separate bucket from join for the same IP', () => {
    const ip = '203.0.113.3';
    const now = 3_000_000;
    for (let i = 0; i < CREATE_RATE_LIMIT; i++) {
      expect(checkCreateRateLimit(ip, now)).toBe(true);
    }
    expect(checkCreateRateLimit(ip, now)).toBe(false);
    // The join bucket for the same IP is untouched by create exhaustion.
    expect(checkJoinRateLimit(ip, now)).toBe(true);
  });
});

describe('checkWsJoinRateLimit', () => {
  it('allows up to the configured limit within the window then rejects', () => {
    const ip = '203.0.113.10';
    const now = 6_000_000;
    for (let i = 0; i < env.WS_JOIN_RATE_LIMIT; i++) {
      expect(checkWsJoinRateLimit(ip, now)).toBe(true);
    }
    expect(checkWsJoinRateLimit(ip, now)).toBe(false);
  });

  it('prunes entries older than the window so later ws joins are allowed again', () => {
    const ip = '203.0.113.11';
    const start = 7_000_000;
    for (let i = 0; i < env.WS_JOIN_RATE_LIMIT; i++) {
      checkWsJoinRateLimit(ip, start);
    }
    expect(checkWsJoinRateLimit(ip, start)).toBe(false);
    expect(checkWsJoinRateLimit(ip, start + RATE_WINDOW_MS + 1)).toBe(true);
  });

  it('keeps a separate bucket from join and create for the same IP', () => {
    const ip = '203.0.113.12';
    const now = 8_000_000;
    for (let i = 0; i < env.WS_JOIN_RATE_LIMIT; i++) {
      expect(checkWsJoinRateLimit(ip, now)).toBe(true);
    }
    expect(checkWsJoinRateLimit(ip, now)).toBe(false);
    // The REST join and create buckets for the same IP are untouched by ws-join exhaustion.
    expect(checkJoinRateLimit(ip, now)).toBe(true);
    expect(checkCreateRateLimit(ip, now)).toBe(true);
  });
});

describe('checkGuessRateLimit', () => {
  it('allows the per-second allowance then rejects within the window', () => {
    const playerId = 'player-a';
    const now = 4_000_000;
    for (let i = 0; i < GUESS_UPDATES_PER_SEC; i++) {
      expect(checkGuessRateLimit(playerId, now)).toBe(true);
    }
    expect(checkGuessRateLimit(playerId, now)).toBe(false);
  });

  it('rolls over once the one-second window elapses', () => {
    const playerId = 'player-b';
    const start = 5_000_000;
    for (let i = 0; i < GUESS_UPDATES_PER_SEC; i++) {
      checkGuessRateLimit(playerId, start);
    }
    expect(checkGuessRateLimit(playerId, start)).toBe(false);
    expect(checkGuessRateLimit(playerId, start + GUESS_RATE_WINDOW_MS + 1)).toBe(true);
  });
});
