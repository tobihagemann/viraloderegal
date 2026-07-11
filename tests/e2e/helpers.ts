import { type APIRequestContext, expect } from '@playwright/test';
import type { ServerEvent } from '@viraloderegal/shared';

export type EventOfType<T extends ServerEvent['type']> = Extract<ServerEvent, { type: T }>;

// The API trusts X-Forwarded-For in this harness, so each test uses a distinct fake client IP to isolate
// its per-IP rate-limit and ban buckets. `label` must be a valid final octet.
export function ip(label: string): Record<string, string> {
  return { 'x-forwarded-for': `198.51.100.${label}` };
}

export async function createRoom(request: APIRequestContext, name: string, headers: Record<string, string>): Promise<{ code: string; sessionToken: string }> {
  const res = await request.post('/rooms', { data: { name }, headers });
  expect(res.status()).toBe(201);
  return res.json();
}

export interface WsClient {
  next: () => Promise<ServerEvent>;
  nextOfType: <T extends ServerEvent['type']>(type: T) => Promise<EventOfType<T>>;
  send: (event: unknown) => void;
  close: () => void;
  closed: Promise<void>;
}

export async function openWs(): Promise<WsClient> {
  const socket = new WebSocket(`ws://localhost:${process.env.E2E_PORT ?? '3000'}`);
  const queue: ServerEvent[] = [];
  const waiters: ((msg: ServerEvent) => void)[] = [];
  socket.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()) as ServerEvent;
    const waiter = waiters.shift();
    if (waiter) {
      waiter(msg);
    } else {
      queue.push(msg);
    }
  });
  const closed = new Promise<void>((resolve) => {
    socket.addEventListener('close', () => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error('ws connection failed')));
  });
  const next = () =>
    new Promise<ServerEvent>((resolve) => {
      const queued = queue.shift();
      if (queued) {
        resolve(queued);
      } else {
        waiters.push(resolve);
      }
    });
  const nextOfType = async <T extends ServerEvent['type']>(type: T): Promise<EventOfType<T>> => {
    for (;;) {
      const msg = await next();
      if (msg.type === type) {
        return msg as EventOfType<T>;
      }
    }
  };
  return { next, nextOfType, send: (event) => socket.send(JSON.stringify(event)), close: () => socket.close(), closed };
}

// Open a socket, bind it to the seat behind `token`, and return it with the player's own id (from the snapshot).
export async function connect(token: string): Promise<{ ws: WsClient; playerId: string }> {
  const ws = await openWs();
  ws.send({ type: 'join', sessionToken: token });
  const snapshot = await ws.nextOfType('snapshot');
  return { ws, playerId: snapshot.you };
}

// The fake YouTube server's cumulative (never-reset) request count for an id; callers assert before/after deltas.
export async function fakeYoutubeCount(id: string): Promise<number> {
  const res = await fetch(`http://localhost:${process.env.E2E_YOUTUBE_PORT ?? '3100'}/__count?id=${id}`);
  const body = (await res.json()) as { count: number };
  return body.count;
}

// Consume lobby broadcasts until one satisfies the predicate (multiple clients race their own broadcasts).
export async function waitForLobby(ws: WsClient, predicate: (lobby: EventOfType<'lobby'>['lobby']) => boolean): Promise<EventOfType<'lobby'>['lobby']> {
  for (;;) {
    const event = await ws.nextOfType('lobby');
    if (predicate(event.lobby)) {
      return event.lobby;
    }
  }
}
