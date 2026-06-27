import { db } from '../db/kysely.js';
import { broadcast, connectedPlayerIds, removeConnection, socketFor } from '../ws/registry.js';
import { CLEANUP_SWEEP_INTERVAL_MS, ROOM_LIFETIME_MS, ROOM_WARNING_LEAD_MS } from './constants.js';
import { cancelAllGraceTimers, cancelAllJoinDeadlines } from './lifecycle.js';
import { withRoomLock } from './roomLock.js';
import { clearPhaseTimer } from './scheduler.js';

let sweepInterval: ReturnType<typeof setInterval> | null = null;
// Rooms already warned this lifetime, so the T-1-minute signal fires once. Cleared on deletion.
const warned = new Set<string>();

export function startCleanupSweep(): void {
  if (sweepInterval) {
    return;
  }
  sweepInterval = setInterval(() => {
    void sweep();
  }, CLEANUP_SWEEP_INTERVAL_MS);
}

export function stopCleanupSweep(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}

async function sweep(): Promise<void> {
  try {
    const now = Date.now();
    // The warn cutoff is more recent than the delete cutoff, so it already subsumes every deletable room;
    // processRoom re-checks each candidate's exact age under the lock to split deletion from warning.
    const warnCutoff = new Date(now - (ROOM_LIFETIME_MS - ROOM_WARNING_LEAD_MS));
    // Select candidates without deleting in the bulk query; each is then re-checked and acted on under its
    // own room lock so a cascade delete cannot interleave with an in-flight advancePhase or ws command.
    const candidates = await db
      .selectFrom('rooms')
      .select('id')
      .where((eb) => eb.or([eb('status', '=', 'abandoned'), eb('created_at', '<', warnCutoff)]))
      .execute();
    for (const candidate of candidates) {
      await withRoomLock(candidate.id, () => processRoom(candidate.id, now));
    }
  } catch (err) {
    console.error('Cleanup sweep skipped (database unreachable):', err);
  }
}

async function processRoom(roomId: string, now: number): Promise<void> {
  const room = await db.selectFrom('rooms').select(['created_at', 'status']).where('id', '=', roomId).executeTakeFirst();
  if (!room) {
    warned.delete(roomId);
    return;
  }
  const age = now - new Date(room.created_at).getTime();
  if (age >= ROOM_LIFETIME_MS || room.status === 'abandoned') {
    clearPhaseTimer(roomId);
    cancelAllGraceTimers(roomId);
    cancelAllJoinDeadlines(roomId);
    // Evict any live sockets before the cascade delete: a connection left in the registry would otherwise
    // run later commands/closes against deleted rows. onClose no-ops once the registry entry is gone.
    for (const playerId of connectedPlayerIds(roomId)) {
      const socket = socketFor(playerId);
      removeConnection(playerId);
      socket?.close();
    }
    await db.deleteFrom('rooms').where('id', '=', roomId).execute();
    warned.delete(roomId);
    return;
  }
  // T-1-minute warning, only while players are present and only once per lifetime.
  if (age >= ROOM_LIFETIME_MS - ROOM_WARNING_LEAD_MS && !warned.has(roomId) && connectedPlayerIds(roomId).size > 0) {
    broadcast(roomId, { type: 'roomWarning', secondsRemaining: Math.max(0, Math.round((ROOM_LIFETIME_MS - age) / 1000)) });
    warned.add(roomId);
  }
}
