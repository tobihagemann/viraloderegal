import { MIN_PLAYERS, type LobbyState, type Player, type RoomStatus } from '@viraloderegal/shared';
import { db } from '../db/kysely.js';
import { broadcast, connectedPlayerIds } from '../ws/registry.js';

interface RoomRow {
  code: string;
  status: RoomStatus;
}

interface PlayerRow {
  id: string;
  name: string;
  join_order: number;
  is_host: boolean;
  sound_activated: boolean;
}

// Pure: maps rows to the lobby view and computes the start-gate. No DB access so it is unit-testable.
// canStart requires at least MIN_PLAYERS connected and every connected player sound-activated.
export function computeLobbyState(room: RoomRow, players: PlayerRow[], connectedIds: Set<string>): LobbyState {
  const roster: Player[] = [...players]
    .sort((a, b) => a.join_order - b.join_order)
    .map((p) => ({
      id: p.id,
      name: p.name,
      joinOrder: p.join_order,
      isHost: p.is_host,
      soundActivated: p.sound_activated,
      connected: connectedIds.has(p.id),
    }));
  const connected = roster.filter((p) => p.connected);
  const canStart = connected.length >= MIN_PLAYERS && connected.every((p) => p.soundActivated);
  return { code: room.code, status: room.status, players: roster, canStart };
}

export async function buildLobbyState(roomId: string, connectedIds: Set<string>): Promise<LobbyState> {
  const room = await db.selectFrom('rooms').select(['code', 'status']).where('id', '=', roomId).executeTakeFirstOrThrow();
  const players = await db.selectFrom('players').select(['id', 'name', 'join_order', 'is_host', 'sound_activated']).where('room_id', '=', roomId).execute();
  return computeLobbyState(room, players, connectedIds);
}

export async function broadcastLobby(roomId: string): Promise<void> {
  const lobby = await buildLobbyState(roomId, connectedPlayerIds(roomId));
  broadcast(roomId, { type: 'lobby', lobby });
}
