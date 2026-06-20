import { serve } from '@hono/node-server';
import { app } from './app.js';
import { closeDb } from './db/kysely.js';
import { env } from './env.js';

// The Node HTTP server handle stays reachable so a WebSocketServer can attach to this same server.
const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Listening on :${info.port}`);
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    server.close();
    await closeDb();
    process.exit(0);
  });
}
