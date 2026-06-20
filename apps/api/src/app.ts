import { Hono } from 'hono';
import { isProduction } from './env.js';
import { health } from './routes/health.js';
import { registerStatic } from './static.js';

export const app = new Hono();

// API routes mount before the static fallback so /health wins over the SPA catch-all.
app.route('/health', health);

// In production the API also serves the built SPA; in dev Vite serves it on a separate port.
if (isProduction) {
  registerStatic(app);
}

app.onError((err, c) => {
  console.error(err);
  return c.json({ code: 'internal' }, 500);
});
