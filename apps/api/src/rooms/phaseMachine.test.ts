import { INTERMISSION_SEC, REVEAL_BOARD_SEC, REVEAL_GUESSES_SEC, REVEAL_STING_SEC, type RoundPhase } from '@viraloderegal/shared';
import { describe, expect, it } from 'vitest';
import { nextPhase, phaseDurationSec } from './phaseMachine.js';

describe('nextPhase', () => {
  it('walks the full sub-phase chain and ends with round_complete', () => {
    const chain: (RoundPhase | 'round_complete')[] = [];
    let phase: RoundPhase | 'round_complete' = 'clip';
    while (phase !== 'round_complete') {
      phase = nextPhase(phase);
      chain.push(phase);
    }
    expect(chain).toEqual(['guess', 'reveal_sting', 'reveal_guesses', 'reveal_board', 'inter', 'round_complete']);
  });
});

describe('phaseDurationSec', () => {
  it('drives the clip phase from the segment length and guess from the configured timer', () => {
    expect(phaseDurationSec('clip', 30, 7)).toBe(7);
    expect(phaseDurationSec('guess', 45, 7)).toBe(45);
  });

  it('uses the shared constants for the reveal sub-phases and intermission', () => {
    expect(phaseDurationSec('reveal_sting', 30, 7)).toBe(REVEAL_STING_SEC);
    expect(phaseDurationSec('reveal_guesses', 30, 7)).toBe(REVEAL_GUESSES_SEC);
    expect(phaseDurationSec('reveal_board', 30, 7)).toBe(REVEAL_BOARD_SEC);
    expect(phaseDurationSec('inter', 30, 7)).toBe(INTERMISSION_SEC);
  });
});
