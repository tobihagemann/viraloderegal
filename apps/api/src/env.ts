import { z } from 'zod';

// In production every secret/endpoint must be set explicitly (fail fast on a missing value). In
// dev/test each falls back to the local Docker Compose stack so it boots with zero config.
export const isProduction = process.env.NODE_ENV === 'production';

const requiredInProd = (devDefault: string) => (isProduction ? z.string().min(1) : z.string().min(1).default(devDefault));

const DEV_DATABASE_URL = 'postgres://viraloderegal:viraloderegal@localhost:5432/viraloderegal';

const envSchema = z.object({
  DATABASE_URL: requiredInProd(DEV_DATABASE_URL),
  PORT: z.coerce.number().int().positive().default(3000),
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
  // Optional so the API boots without them; tighten to required when auth/curation use them.
  YOUTUBE_API_KEY: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.flattenError(parsed.error).fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = Object.freeze(parsed.data);
