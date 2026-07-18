import { INTERMISSION_SEC, PREPARE_SEC, REVEAL_BOARD_SEC, REVEAL_GUESSES_SEC, type RoundPhase } from '@viraloderegal/shared';
import { describe, expect, it } from 'vitest';
import { nextPhase, phaseDurationSec } from './phaseMachine.js';

describe('nextPhase', () => {
  it('walks the full sub-phase chain and ends with round_complete', () => {
    const chain: (RoundPhase | 'round_complete')[] = [];
    let phase: RoundPhase | 'round_complete' = 'prepare';
    while (phase !== 'round_complete') {
      phase = nextPhase(phase);
      chain.push(phase);
    }
    expect(chain).toEqual(['clip', 'guess', 'reveal_guesses', 'reveal_board', 'inter', 'round_complete']);
  });
});

describe('phaseDurationSec', () => {
  it('drives the prepare pre-buffer from its constant, the clip phase from the segment length, and guess from the configured timer', () => {
    expect(phaseDurationSec('prepare', 30, 7)).toBe(PREPARE_SEC);
    expect(phaseDurationSec('clip', 30, 7)).toBe(7);
    expect(phaseDurationSec('guess', 45, 7)).toBe(45);
  });

  it('uses the shared constants for the reveal phases and intermission', () => {
    expect(phaseDurationSec('reveal_guesses', 30, 7)).toBe(REVEAL_GUESSES_SEC);
    expect(phaseDurationSec('reveal_board', 30, 7)).toBe(REVEAL_BOARD_SEC);
    expect(phaseDurationSec('inter', 30, 7)).toBe(INTERMISSION_SEC);
  });
});
