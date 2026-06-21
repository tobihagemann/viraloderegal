import { Hono } from 'hono';
import { auth } from './auth/auth.js';
import { TRUSTED_IP_HEADER } from './auth/ip.js';
import { isProduction } from './env.js';
import { clientIp } from './rooms/clientIp.js';
import { adminInvites } from './routes/adminInvites.js';
import { health } from './routes/health.js';
import { rooms } from './routes/rooms.js';
import { registerStatic } from './static.js';

export const app = new Hono();

// API routes mount before the static fallback so they win over the SPA catch-all.
app.route('/health', health);
app.route('/rooms', rooms);
app.route('/admin/invites', adminInvites);
// better-auth owns everything under its base path; mount it ahead of the SPA fallback so its routes win. Hand
// it the app-resolved trusted client IP on a dedicated header so its rate limiter can't be fooled by a spoofed
// X-Forwarded-For. Always drop any inbound value for that header first so a client can never supply its own,
// then set it only when the IP resolves (it can't when there's no socket, e.g. in-memory app.request()).
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const headers = new Headers(c.req.raw.headers);
  headers.delete(TRUSTED_IP_HEADER);
  try {
    headers.set(TRUSTED_IP_HEADER, clientIp(c));
  } catch {
    // No resolvable client IP; let better-auth fall back rather than failing the request.
  }
  return auth.handler(new Request(c.req.raw, { headers }));
});

// In production the API also serves the built SPA; in dev Vite serves it on a separate port.
if (isProduction) {
  registerStatic(app);
}

app.onError((err, c) => {
  console.error(err);
  return c.json({ code: 'internal' }, 500);
});
