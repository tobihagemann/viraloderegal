import type { HealthResponse } from '@viraloderegal/shared';
import { Hono } from 'hono';

// GET /health — intentionally does not touch the database; it backs the container liveness check.
export const health = new Hono().get('/', (c) => c.json({ status: 'ok', uptime: process.uptime() } satisfies HealthResponse));
