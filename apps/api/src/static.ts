import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import { env } from './env.js';

// Serve the built SPA: hashed assets and real files via serveStatic, every other path the index shell so
// client-side routing resolves. Only mounted in production (see app.ts) — all filesystem access is lazy
// here, never at module load, so importing this module in dev/test (no built dist) is harmless.
export function registerStatic(app: Hono): void {
  const root = path.resolve(env.WEB_DIST_DIR);
  const indexHtml = readFileSync(path.join(root, 'index.html'), 'utf8');

  app.use('*', serveStatic({ root }));
  app.get('*', (c) => c.html(indexHtml));
}
