// Postgres error inspection by SQLSTATE + constraint name, shared by the route/service layers that map a
// specific violation to a user-facing { code } instead of a generic 500.

interface PgError {
  code?: string;
  constraint?: string;
}

/** A unique-violation (23505) on the named constraint. */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as PgError;
  return e?.code === '23505' && e.constraint === constraint;
}

/** A check-violation (23514) on the named constraint. */
export function isCheckViolation(err: unknown, constraint: string): boolean {
  const e = err as PgError;
  return e?.code === '23514' && e.constraint === constraint;
}
