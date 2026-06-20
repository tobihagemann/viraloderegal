import { closeDb } from './kysely.js';
import { runMigrations } from './migrator.js';

// Wrap in try/finally so the process exits instead of hanging on idle pool clients.
try {
  await runMigrations();
} finally {
  await closeDb();
}
