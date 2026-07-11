import { z } from 'zod';
import { isLoopbackBaseUrl } from './youtube/transport.js';

// In production every secret/endpoint must be set explicitly (fail fast on a missing value). In
// dev/test each falls back to the local Docker Compose stack so it boots with zero config.
export const isProduction = process.env.NODE_ENV === 'production';

const requiredInProd = (devDefault: string) => (isProduction ? z.string().min(1) : z.string().min(1).default(devDefault));

const DEV_DATABASE_URL = 'postgres://viraloderegal:viraloderegal@localhost:5432/viraloderegal';
// better-auth documents a high-entropy ≥32-char secret. The dev default must itself be ≥32 chars or this
// module throws at import (reddening Vitest, which loads the app before migrate).
const DEV_BETTER_AUTH_SECRET = 'dev-better-auth-secret-change-me-0123456789';

const envSchema = z
  .object({
    DATABASE_URL: requiredInProd(DEV_DATABASE_URL),
    PORT: z.coerce.number().int().positive().default(3000),
    // Per-IP ws-join allowance per RATE_WINDOW_MS, more generous than the REST join bucket so a flaky-network
    // player reconnecting to their own game is never locked out. Env-overridable so the e2e harness can raise it.
    WS_JOIN_RATE_LIMIT: z.coerce.number().int().positive().default(30),
    // Trust X-Forwarded-For for the real client IP (rate-limit and ban keys). On only behind a proxy that
    // populates the header (Traefik in production); off in dev so the socket peer is used. Never trust it
    // unconditionally — an unproxied client could spoof the header.
    TRUST_PROXY: z
      .enum(['true', 'false', '1', '0'])
      .default('false')
      .transform((v) => v === 'true' || v === '1'),
    // Directory holding the built SPA (apps/web/dist) the API serves in production. Never read in dev
    // (Vite serves the SPA), so the default is a placeholder; the image sets the absolute path.
    WEB_DIST_DIR: requiredInProd('../web/dist'),
    // Optional so the API boots without it; tighten to required when curation uses it.
    YOUTUBE_API_KEY: z.string().min(1).optional(),
    // `fake` redirects YouTube egress to a loopback test server (see YOUTUBE_API_BASE_URL); used by e2e to
    // observe outbound calls. Defaults to the real Data API, so production is unaffected.
    YOUTUBE_TRANSPORT: z.enum(['live', 'fake']).default('live'),
    // Consulted only in `fake` transport mode — a test seam, never a production knob. The .superRefine below
    // fails closed: a value outside loopback (or set at all in `live` mode) is rejected at startup, so the
    // key-bearing request can never be pointed at an external host.
    YOUTUBE_API_BASE_URL: z.url().optional(),
    // Admin auth (better-auth) + invite email. Required in prod; dev/test fall back to working placeholders so
    // a bare checkout still boots. The secret must be ≥32 chars per better-auth.
    BETTER_AUTH_SECRET: isProduction ? z.string().min(32) : z.string().min(32).default(DEV_BETTER_AUTH_SECRET),
    // Base URL better-auth uses to build invite/callback links.
    BETTER_AUTH_URL: requiredInProd('http://localhost:3000'),
    SMTP_HOST: requiredInProd('localhost'),
    SMTP_PORT: isProduction ? z.coerce.number().int().positive() : z.coerce.number().int().positive().default(587),
    SMTP_USER: requiredInProd('viraloderegal'),
    SMTP_PASSWORD: requiredInProd('viraloderegal'),
    SMTP_FROM: requiredInProd('Viral oder Egal <noreply@viraloderegal.de>'),
    // `json` swaps the SMTP transport for nodemailer's offline jsonTransport (no network); used by e2e so the
    // invite flow runs without a mail server. Defaults to real SMTP, so production is unaffected.
    MAIL_TRANSPORT: z.enum(['smtp', 'json']).default('smtp'),
    // Seeded at deploy time so the first admin can sign in and invite the rest.
    BOOTSTRAP_ADMIN_EMAIL: requiredInProd('admin@viraloderegal.de'),
    BOOTSTRAP_ADMIN_PASSWORD: requiredInProd('viraloderegal'),
  })
  // Fail closed on the YouTube base-URL override (YOUTUBE_API_KEY is appended to it, so an arbitrary override
  // would exfiltrate the key). `fake` requires a loopback base URL; `live` forbids the override outright so a
  // stray value fails fast rather than being silently ignored.
  .superRefine((cfg, ctx) => {
    if (cfg.YOUTUBE_TRANSPORT === 'fake') {
      if (cfg.YOUTUBE_API_BASE_URL === undefined || !isLoopbackBaseUrl(cfg.YOUTUBE_API_BASE_URL)) {
        ctx.addIssue({ code: 'custom', path: ['YOUTUBE_API_BASE_URL'], message: 'fake transport requires a loopback http:// base URL' });
      }
    } else if (cfg.YOUTUBE_API_BASE_URL !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['YOUTUBE_API_BASE_URL'], message: 'YOUTUBE_API_BASE_URL is only honored in fake transport mode' });
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.flattenError(parsed.error).fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = Object.freeze(parsed.data);
