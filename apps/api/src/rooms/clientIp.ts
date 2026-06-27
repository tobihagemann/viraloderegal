import type { IncomingMessage } from 'node:http';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { env } from '../env.js';

// Pure resolver so both trust modes are unit-testable. With a single trusted proxy the rightmost
// X-Forwarded-For entry is the address the proxy itself observed (the real client), so it is safe even
// if the client spoofed earlier entries. Without trust, use the socket peer.
export function resolveClientIp(trustProxy: boolean, forwardedFor: string | undefined, peerAddress: string | undefined): string {
  if (trustProxy && forwardedFor) {
    const entries = forwardedFor
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const rightmost = entries.at(-1);
    if (rightmost !== undefined) {
      return rightmost;
    }
  }
  if (!peerAddress) {
    throw new Error('Could not determine client IP');
  }
  return peerAddress;
}

export function clientIp(c: Context): string {
  return resolveClientIp(env.TRUST_PROXY, c.req.header('x-forwarded-for'), getConnInfo(c).remote.address);
}

// The x-forwarded-for header type allows an array; collapse it to the single comma-string node normally
// produces so resolveClientIp reads the rightmost (trusted-proxy) entry uniformly across both shapes.
export function normalizeForwardedFor(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header.join(', ') : header;
}

export function wsClientIp(req: IncomingMessage): string {
  return resolveClientIp(env.TRUST_PROXY, normalizeForwardedFor(req.headers['x-forwarded-for']), req.socket.remoteAddress);
}
