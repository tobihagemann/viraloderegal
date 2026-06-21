import { betterAuth } from 'better-auth';
import { admin, createAccessControl, organization } from 'better-auth/plugins';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';
import { pool } from '../db/kysely.js';
import { env, isProduction } from '../env.js';
import { TRUSTED_IP_HEADER } from './ip.js';
import { sendInvitationEmail } from './mailer.js';

// Custom access control so a real `superadmin` role exists. Supplying `ac`/`roles` means the admin plugin no
// longer recognizes its built-in `admin` role, so `adminRoles` must name `superadmin` too. `superadmin`
// carries the admin plugin's full statement set (user:create/set-role/…).
const ac = createAccessControl({ ...defaultStatements });
const superadmin = ac.newRole({ ...adminAc.statements });

const INVITATION_EXPIRES_SEC = 60 * 60 * 24;

// Scoped entirely to /admin: email+password sign-in with no self-signup, an expiring email-invite flow, on the
// shared Postgres pool (the API is the only DB client). `disableSignUp` also blocks the server-side
// signUpEmail, so the bootstrap seed and invite-accept create accounts via the internal adapter.
export const auth = betterAuth({
  database: pool,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  // In dev the SPA is served from Vite on a separate origin and proxies auth calls here, so that origin must
  // be trusted for better-auth's same-origin check on cookie POSTs; in production the API serves the SPA
  // same-origin, so baseURL already covers it.
  trustedOrigins: isProduction ? undefined : ['http://localhost:5173'],
  // Key the rate limiter off the app-resolved trusted IP (injected on TRUSTED_IP_HEADER in app.ts) instead of
  // better-auth's default leftmost-X-Forwarded-For read, which a client can spoof.
  advanced: { ipAddress: { ipAddressHeaders: [TRUSTED_IP_HEADER] } },
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [
    admin({ ac, roles: { superadmin }, adminRoles: ['superadmin'] }),
    organization({ invitationExpiresIn: INVITATION_EXPIRES_SEC, sendInvitationEmail: (data) => sendInvitationEmail(data) }),
  ],
});
