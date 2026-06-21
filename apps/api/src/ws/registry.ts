import type { ServerEvent } from '@viraloderegal/shared';
import { WebSocket } from 'ws';

// In-memory connection registry — the single source of truth for "connected". A player is connected iff
// this map holds a live socket for them; players.disconnected_at only persists that fact across restarts.
interface Connection {
  socket: WebSocket;
  roomId: string;
}

const connections = new Map<string, Connection>();
const roomMembers = new Map<string, Set<string>>();

// A bind replaces any prior connection for the player. A superseded socket's later close is recognized by
// comparing socket identity against the live connection (see socketFor) rather than tracking generations.
export function addConnection(playerId: string, roomId: string, socket: WebSocket): void {
  connections.set(playerId, { socket, roomId });
  let members = roomMembers.get(roomId);
  if (!members) {
    members = new Set();
    roomMembers.set(roomId, members);
  }
  members.add(playerId);
}

export function removeConnection(playerId: string): void {
  const connection = connections.get(playerId);
  if (!connection) {
    return;
  }
  connections.delete(playerId);
  const members = roomMembers.get(connection.roomId);
  if (members) {
    members.delete(playerId);
    if (members.size === 0) {
      roomMembers.delete(connection.roomId);
    }
  }
}

export function socketFor(playerId: string): WebSocket | undefined {
  return connections.get(playerId)?.socket;
}

export function connectedPlayerIds(roomId: string): Set<string> {
  return new Set(roomMembers.get(roomId) ?? []);
}

export function broadcast(roomId: string, event: ServerEvent): void {
  const members = roomMembers.get(roomId);
  if (!members) {
    return;
  }
  const payload = JSON.stringify(event);
  for (const playerId of members) {
    const connection = connections.get(playerId);
    if (connection && connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(payload);
    }
  }
}
