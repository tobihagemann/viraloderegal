import { type Kysely, sql } from 'kysely';

// The reveal_sting sub-phase is merged into reveal_guesses: the reveal phase now spans the client's whole
// reveal choreography (suspense, sting, read time). Remap any in-flight round persisted mid-sting so a room
// resumed across the deploy lands on a phase the code still walks, and extend its deadline by the merged
// phase's extra length (15s reveal minus the 3s sting) so the resumed reveal gets its full window instead of
// expiring at the old sting boundary. The orphaned 'reveal_sting' enum value stays in the type — enums are
// treated as append-only across this schema (dropping a value requires rewriting the column and type) — but
// nothing writes it anymore.
export const up = async (db: Kysely<any>): Promise<void> => {
  await sql`UPDATE rounds SET current_phase = 'reveal_guesses', phase_end_at = phase_end_at + interval '12 seconds' WHERE current_phase = 'reveal_sting'`.execute(
    db,
  );
};

export const down = async (): Promise<void> => {
  // No-op: the remapped rows are indistinguishable from rounds that reached reveal_guesses on their own.
};
