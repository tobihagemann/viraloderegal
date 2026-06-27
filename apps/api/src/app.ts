import { Hono } from 'hono';
import { auth } from './auth/auth.js';
import { TRUSTED_IP_HEADER } from './auth/ip.js';
import { isProduction } from './env.js';
import { errorJson } from './http/errorResponse.js';
import { clientIp } from './rooms/clientIp.js';
import { adminInvites } from './routes/adminInvites.js';
import { adminSets } from './routes/adminSets.js';
import { adminVideos } from './routes/adminVideos.js';
import { health } from './routes/health.js';
import { rooms } from './routes/rooms.js';
import { sets } from './routes/sets.js';
import { registerStatic } from './static.js';

export const app = new Hono();

// API routes mount before the static fallback so they win over the SPA catch-all.
app.route('/health', health);
app.route('/rooms', rooms);
app.route('/admin/invites', adminInvites);
// Curation lives under /api so it never shadows the SPA's own /admin/videos and /admin/sets document routes
// (an API GET on those paths would otherwise win over the SPA fallback on a refresh/deep-link). The set list
// is public (host start menu); the CRUD modules each front their own routes with requireAdmin.
app.route('/api/sets', sets);
app.route('/api/admin/videos', adminVideos);
app.route('/api/admin/sets', adminSets);
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
  return errorJson(c, 'internal', 500);
});
