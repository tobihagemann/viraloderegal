import { z } from 'zod';

export interface PlayerGuess {
  playerName: string;
  /** The player's raw guess, or null when none was submitted in time. */
  guess: number | null;
}

export const roundScoreSchema = z.object({
  playerName: z.string(),
  guess: z.number().int().nullable(),
  /** abs(guess − viewCount), or null when no guess was submitted. */
  distance: z.number().int().nullable(),
  points: z.number().int(),
  isWinner: z.boolean(),
});
export type RoundScore = z.infer<typeof roundScoreSchema>;

// A player's cumulative position; ties share a rank (standard competition ranking) and zero-point
// players sort last.
export const standingSchema = z.object({
  playerName: z.string(),
  totalPoints: z.number().int(),
  rank: z.number().int(),
});
export type Standing = z.infer<typeof standingSchema>;

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

/**
 * Sum each player's points into a cumulative leaderboard, highest first. Tied players share a rank and
 * the next distinct score resumes at its absolute position (1, 1, 3 …); ordering within a tie is by name
 * so the result is deterministic.
 */
export function computeLeaderboard(rows: { playerName: string; points: number }[]): Standing[] {
  const totals = new Map<string, number>();
  for (const { playerName, points } of rows) {
    totals.set(playerName, (totals.get(playerName) ?? 0) + points);
  }
  const ordered = [...totals.entries()]
    .map(([playerName, totalPoints]) => ({ playerName, totalPoints }))
    .sort((a, b) => b.totalPoints - a.totalPoints || a.playerName.localeCompare(b.playerName));
  const standings: Standing[] = [];
  ordered.forEach((entry, index) => {
    const previous = standings[index - 1];
    const rank = previous && previous.totalPoints === entry.totalPoints ? previous.rank : index + 1;
    standings.push({ ...entry, rank });
  });
  return standings;
}
