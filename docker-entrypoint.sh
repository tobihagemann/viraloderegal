#!/bin/sh
set -e

# Auto-migrate on startup, then hand the process over to the server. Safe only for a single app instance
# (concurrent startups would race the migrator). tsx is required because the migrations are uncompiled
# .ts imported at runtime by FileMigrationProvider.
node --import tsx /app/api/dist/db/migrate.js

# exec so SIGTERM reaches Node and the graceful-shutdown handler in server.ts runs.
exec node /app/api/dist/server.js
