export interface PlayerGuess {
  playerName: string;
  /** The player's raw guess, or null when none was submitted in time. */
  guess: number | null;
}

export interface RoundScore {
  playerName: string;
  guess: number | null;
  /** abs(guess − viewCount), or null when no guess was submitted. */
  distance: number | null;
  points: number;
  isWinner: boolean;
}

/** Absolute distance between a guess and the true view count. */
export function guessDistance(guess: number, viewCount: number): number {
  return Math.abs(guess - viewCount);
}

/**
 * Score a round's guesses against the true view count. The player(s) with the
 * smallest distance win and share +1 point (ties allowed); a player with no
 * guess scores 0 with a null distance.
 */
export function scoreRound(guesses: PlayerGuess[], viewCount: number): RoundScore[] {
  let bestDistance = Infinity;
  for (const { guess } of guesses) {
    if (guess === null) continue;
    const distance = guessDistance(guess, viewCount);
    if (distance < bestDistance) {
      bestDistance = distance;
    }
  }

  return guesses.map(({ playerName, guess }) => {
    if (guess === null) {
      return { playerName, guess: null, distance: null, points: 0, isWinner: false };
    }
    const distance = guessDistance(guess, viewCount);
    const isWinner = distance === bestDistance;
    return { playerName, guess, distance, points: isWinner ? 1 : 0, isWinner };
  });
}
