import { type Kysely, sql } from 'kysely';

// Add the get-ready pre-buffer sub-phase to round_phase, before 'clip' to keep the enum order aligned with
// the shared ROUND_PHASES tuple (cosmetic — no query sorts by phase). The value is only added here, never
// used in this transaction, so it is safe under Kysely's transactional migrator on PG12+; IF NOT EXISTS
// keeps it idempotent.
export const up = async (db: Kysely<any>): Promise<void> => {
  await sql`ALTER TYPE round_phase ADD VALUE IF NOT EXISTS 'prepare' BEFORE 'clip'`.execute(db);
};

export const down = async (): Promise<void> => {
  // No-op: Postgres cannot drop an enum value without rewriting the column and type, which is disproportionate
  // here. Enums are treated as append-only across this schema.
};
