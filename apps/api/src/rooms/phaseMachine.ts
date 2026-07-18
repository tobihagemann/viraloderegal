import { INTERMISSION_SEC, PREPARE_SEC, REVEAL_BOARD_SEC, REVEAL_GUESSES_SEC, ROUND_PHASES, type RoundPhase } from '@viraloderegal/shared';

// Sentinel returned by nextPhase once a round's final sub-phase (inter) is done; the scheduler then either
// starts the next round or ends the game.
export type PhaseAdvance = RoundPhase | 'round_complete';

// The prepare phase gives clients a fixed get-ready window to cue the player; the clip phase runs for the
// round's actual segment length so guessing stays closed until playback ends; guess uses the game's
// configured timer; the reveal phases and intermission use their shared constants.
export function phaseDurationSec(phase: RoundPhase, guessTimerSec: number, clipLengthSec: number): number {
  switch (phase) {
    case 'prepare':
      return PREPARE_SEC;
    case 'clip':
      return clipLengthSec;
    case 'guess':
      return guessTimerSec;
    case 'reveal_guesses':
      return REVEAL_GUESSES_SEC;
    case 'reveal_board':
      return REVEAL_BOARD_SEC;
    case 'inter':
      return INTERMISSION_SEC;
  }
}

export function nextPhase(current: RoundPhase): PhaseAdvance {
  const next = ROUND_PHASES[ROUND_PHASES.indexOf(current) + 1];
  return next ?? 'round_complete';
}
