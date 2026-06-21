import { RECONNECT_GRACE_SEC } from '@viraloderegal/shared';
import { db } from '../db/kysely.js';
import { connectedPlayerIds } from '../ws/registry.js';
import { clearPhaseTimer, resumeScheduler } from './scheduler.js';
import { withRoomLock } from './roomLock.js';
import { broadcastLobby } from './snapshot.js';

// Pending removal timers keyed by playerId. The roomId is stored so a room-wide pause can cancel them all.
const graceTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; roomId: string }>();

function startGraceTimer(playerId: string, roomId: string): void {
  cancelGraceTimer(playerId);
  const timer = setTimeout(() => {
    void withRoomLock(roomId, () => expireGrace(playerId, roomId));
  }, RECONNECT_GRACE_SEC * 1000);
  graceTimers.set(playerId, { timer, roomId });
}

export function cancelGraceTimer(playerId: string): void {
  const entry = graceTimers.get(playerId);
  if (entry) {
    clearTimeout(entry.timer);
    graceTimers.delete(playerId);
  }
}

export function cancelAllGraceTimers(roomId: string): void {
  for (const [playerId, entry] of graceTimers) {
    if (entry.roomId === roomId) {
      clearTimeout(entry.timer);
      graceTimers.delete(playerId);
    }
  }
}

// The connected player with the lowest join_order greater than afterJoinOrder, wrapping to the lowest
// connected join_order. Null when no one is connected.
async function pickSuccessor(roomId: string, afterJoinOrder: number, connectedIds: Set<string>): Promise<string | null> {
  if (connectedIds.size === 0) {
    return null;
  }
  const players = await db
    .selectFrom('players')
    .select(['id', 'join_order'])
    .where('room_id', '=', roomId)
    .where('id', 'in', [...connectedIds])
    .orderBy('join_order')
    .execute();
  const successor = players.find((p) => p.join_order > afterJoinOrder) ?? players[0];
  return successor?.id ?? null;
}

// Make targetId the room's sole host in one statement, so the room can never transiently hold two host
// rows — the invariant is enforced purely in application code (no DB constraint backs it).
async function setSoleHost(roomId: string, targetId: string): Promise<void> {
  await db
    .updateTable('players')
    .set((eb) => ({ is_host: eb('id', '=', targetId).$castTo<boolean>() }))
    .where('room_id', '=', roomId)
    .execute();
}

// Promote the deterministic successor to sole host when one is connected; otherwise leave the host flag
// as-is (deferred until a successor reconnects). Used for both host disconnect and host removal.
export async function assignHost(roomId: string, afterJoinOrder: number, connectedIds: Set<string>): Promise<void> {
  const successorId = await pickSuccessor(roomId, afterJoinOrder, connectedIds);
  if (successorId) {
    await setSoleHost(roomId, successorId);
  }
}

// A socket closed without a kick/ban. Persist the disconnect, transfer host if needed, then either start
// the grace timer or, if the room just emptied of connected sockets, pause it (cancel all timers, retain
// every row) until someone reconnects. The caller has already removed this player from the registry.
export async function onPlayerDisconnected(playerId: string, roomId: string): Promise<void> {
  const player = await db.selectFrom('players').select(['is_host', 'join_order']).where('id', '=', playerId).executeTakeFirst();
  if (!player) {
    await broadcastLobby(roomId);
    return;
  }
  await db.updateTable('players').set({ disconnected_at: new Date() }).where('id', '=', playerId).where('disconnected_at', 'is', null).execute();
  const connected = connectedPlayerIds(roomId);
  if (player.is_host) {
    await assignHost(roomId, player.join_order, connected);
  }
  if (connected.size === 0) {
    // The room just emptied: pause it. Grace timers and the phase scheduler both stop; the persisted
    // disconnected_at and rounds.phase_end_at are the durable state until someone reconnects.
    cancelAllGraceTimers(roomId);
    clearPhaseTimer(roomId);
  } else {
    startGraceTimer(playerId, roomId);
  }
  await broadcastLobby(roomId);
}

// Grace elapsed: drop the player (freeing the name and seat). If that emptied the room, mark it abandoned.
async function expireGrace(playerId: string, roomId: string): Promise<void> {
  graceTimers.delete(playerId);
  // The timer can fire while a reconnect is queued ahead of this on the room lock; clearTimeout no longer
  // helps once fired. The registry is the source of truth for "connected", so bail if they came back.
  if (connectedPlayerIds(roomId).has(playerId)) {
    return;
  }
  // A grace timer that already fired can survive cancelAllGraceTimers when the room emptied; dropping the
  // player now would break the paused room's "reconnectable until cleanup" contract. The room is durable.
  if (connectedPlayerIds(roomId).size === 0) {
    return;
  }
  await db.transaction().execute(async (trx) => {
    // Lock the room row so a concurrent REST join (which also takes it FOR UPDATE) cannot insert a player
    // between the empty check and the abandoned write, which would abandon a room that just gained a seat.
    await trx.selectFrom('rooms').select('id').where('id', '=', roomId).forUpdate().execute();
    await trx.deleteFrom('players').where('id', '=', playerId).execute();
    const remaining = await trx.selectFrom('players').select('id').where('room_id', '=', roomId).execute();
    if (remaining.length === 0) {
      await trx.updateTable('rooms').set({ status: 'abandoned' }).where('id', '=', roomId).execute();
    }
  });
  await broadcastLobby(roomId);
}

// First reconnect into a fully-paused room: restart grace timers for the players still disconnected and,
// if no connected player currently holds the host flag, hand it to the lowest-join_order connected player.
export async function resumeIfPaused(roomId: string, wasEmpty: boolean): Promise<void> {
  if (!wasEmpty) {
    return;
  }
  const players = await db
    .selectFrom('players')
    .select(['id', 'is_host', 'join_order', 'disconnected_at'])
    .where('room_id', '=', roomId)
    .orderBy('join_order')
    .execute();
  const connected = connectedPlayerIds(roomId);
  for (const p of players) {
    if (!connected.has(p.id) && p.disconnected_at) {
      startGraceTimer(p.id, roomId);
    }
  }
  // Restart the phase timer from the persisted phase_end_at if a game is mid-round. Lock-free: this runs
  // under the caller's room lock, so it must not re-acquire it.
  await resumeScheduler(roomId);
  const hostConnected = players.some((p) => p.is_host && connected.has(p.id));
  if (hostConnected) {
    return;
  }
  const successor = players.find((p) => connected.has(p.id));
  if (successor) {
    await setSoleHost(roomId, successor.id);
  }
}

// Only the current host may hand back, and only to the original host (join_order 0) when they are present.
export async function handBackHost(currentHostId: string, roomId: string): Promise<void> {
  const players = await db.selectFrom('players').select(['id', 'is_host', 'join_order']).where('room_id', '=', roomId).orderBy('join_order').execute();
  const caller = players.find((p) => p.id === currentHostId);
  if (!caller?.is_host) {
    return;
  }
  const original = players.find((p) => p.join_order === 0);
  if (!original || original.id === currentHostId || !connectedPlayerIds(roomId).has(original.id)) {
    return;
  }
  await setSoleHost(roomId, original.id);
}

// On boot the registry and timers are empty, but persisted rows may still read as connected
// (disconnected_at NULL from before a restart). Treat every player in a live room as disconnected and
// leave the room paused (no timers run) until the first reconnect resumes it. Tolerates an unreachable DB.
export async function reconcileOnStartup(): Promise<void> {
  try {
    await db
      .updateTable('players')
      .set({ disconnected_at: new Date() })
      .where('disconnected_at', 'is', null)
      .where('room_id', 'in', (eb) => eb.selectFrom('rooms').select('id').where('status', 'in', ['lobby', 'active']))
      .execute();
  } catch (err) {
    console.error('Startup reconciliation skipped (database unreachable):', err);
  }
}
