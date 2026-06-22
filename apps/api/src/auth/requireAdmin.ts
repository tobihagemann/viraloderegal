import { createMiddleware } from 'hono/factory';
import { auth } from './auth.js';

// The admin-session boundary every admin CRUD/refresh route mounts behind. "Any valid better-auth session ⇒
// admin" is sound only because players are connection-bound and accountless: better-auth accounts exist
// exclusively for admins (the bootstrap seed plus invited members). The guard therefore checks only for a
// session, not a role. If a non-admin better-auth account type is ever introduced, this silently widens admin
// access and must gain explicit role gating.
export const requireAdmin = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ code: 'unauthorized' }, 401);
  }
  await next();
});
