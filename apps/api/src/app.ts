import { Hono } from 'hono';
import { isProduction } from './env.js';
import { health } from './routes/health.js';
import { rooms } from './routes/rooms.js';
import { registerStatic } from './static.js';

export const app = new Hono();

// API routes mount before the static fallback so they win over the SPA catch-all.
app.route('/health', health);
app.route('/rooms', rooms);

// In production the API also serves the built SPA; in dev Vite serves it on a separate port.
if (isProduction) {
  registerStatic(app);
}

app.onError((err, c) => {
  console.error(err);
  return c.json({ code: 'internal' }, 500);
});
