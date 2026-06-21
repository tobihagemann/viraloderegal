import { serve } from '@hono/node-server';
import { app } from './app.js';
import { closeDb } from './db/kysely.js';
import { env } from './env.js';
import { reconcileOnStartup } from './rooms/lifecycle.js';
import { attachWebSocketHub } from './ws/hub.js';

// Reconcile persisted presence before accepting traffic, otherwise a reconnect could clear disconnected_at
// before the pass marks that row disconnected.
await reconcileOnStartup();

// The Node HTTP server handle stays reachable so a WebSocketServer can attach to this same server.
const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Listening on :${info.port}`);
});

attachWebSocketHub(server);

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    server.close();
    await closeDb();
    process.exit(0);
  });
}
