import { randomUUID } from 'node:crypto';

// Opaque reconnection key bound to players.session_token; the client presents it on the ws join to
// resume its seat.
export function generateSessionToken(): string {
  return randomUUID();
}
