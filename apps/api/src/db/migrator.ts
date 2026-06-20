import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { db } from './kysely.js';

const migrationFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

function createMigrator(): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder }),
  });
}

export async function runMigrations(): Promise<void> {
  const { error, results } = await createMigrator().migrateToLatest();
  for (const result of results ?? []) {
    console.log(
      JSON.stringify({
        migration: result.migrationName,
        direction: result.direction,
        status: result.status,
      }),
    );
  }
  if (error) {
    throw error;
  }
}
