import { serve } from '@hono/node-server';
import { app } from './app.js';
import { seedBootstrap } from './auth/bootstrap.js';
import { closeDb } from './db/kysely.js';
import { env } from './env.js';
import { startCleanupSweep, stopCleanupSweep } from './rooms/cleanup.js';
import { reconcileOnStartup } from './rooms/lifecycle.js';
import { rehydrateSchedulers } from './rooms/scheduler.js';
import { startRefreshJob, stopRefreshJob } from './youtube/refreshJob.js';
import { attachWebSocketHub } from './ws/hub.js';

// Reconcile persisted presence before accepting traffic, otherwise a reconnect could clear disconnected_at
// before the pass marks that row disconnected. Scheduler rehydration and the idempotent bootstrap-admin seed
// run in the same pre-serve window, after migrations have created the auth tables.
await reconcileOnStartup();
await rehydrateSchedulers();
await seedBootstrap();

// The Node HTTP server handle stays reachable so a WebSocketServer can attach to this same server.
const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Listening on :${info.port}`);
});

attachWebSocketHub(server);
startCleanupSweep();
startRefreshJob();

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    stopCleanupSweep();
    stopRefreshJob();
    server.close();
    await closeDb();
    process.exit(0);
  });
}
