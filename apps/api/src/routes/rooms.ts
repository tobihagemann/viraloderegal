import { type CreateRoomResponse, createRoomRequestSchema, type JoinRoomResponse, joinRoomRequestSchema } from '@viraloderegal/shared';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { clientIp } from '../rooms/clientIp.js';
import { armJoinDeadline } from '../rooms/lifecycle.js';
import { checkCreateRateLimit, checkJoinRateLimit } from '../rooms/ratelimit.js';
import { createRoom, type JoinRoomError, joinRoom } from '../rooms/service.js';

const JOIN_ERROR_STATUS: Record<JoinRoomError, ContentfulStatusCode> = {
  empty: 400,
  invalid_chars: 400,
  too_short: 400,
  too_long: 400,
  reserved: 400,
  not_found: 404,
  not_joinable: 409,
  banned: 403,
  room_full: 409,
  name_taken: 409,
};

export const rooms = new Hono()
  .post('/', async (c) => {
    const body = createRoomRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ code: 'invalid_request' }, 400);
    }
    const ip = clientIp(c);
    if (!checkCreateRateLimit(ip)) {
      return c.json({ code: 'rate_limited' }, 429);
    }
    const result = await createRoom({ name: body.data.name, ip });
    if (!result.ok) {
      return c.json({ code: result.error }, 400);
    }
    return c.json({ code: result.code, sessionToken: result.sessionToken } satisfies CreateRoomResponse, 201);
  })
  .post('/join', async (c) => {
    const body = joinRoomRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ code: 'invalid_request' }, 400);
    }
    const ip = clientIp(c);
    if (!checkJoinRateLimit(ip)) {
      return c.json({ code: 'rate_limited' }, 429);
    }
    const result = await joinRoom({ code: body.data.code, name: body.data.name, ip });
    if (!result.ok) {
      return c.json({ code: result.error }, JOIN_ERROR_STATUS[result.error]);
    }
    // Reclaim the seat if no socket binds in time. Armed before responding so it is race-free: the client
    // cannot open a ws until it receives the session token below, by which point the deadline is pending.
    armJoinDeadline(result.playerId, result.roomId);
    return c.json({ sessionToken: result.sessionToken } satisfies JoinRoomResponse, 200);
  });
