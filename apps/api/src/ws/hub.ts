import type { Server } from 'node:http';
import { type ClientCommand, clientCommandSchema, type ServerEvent, type WireErrorCode } from '@viraloderegal/shared';
import type { ServerType } from '@hono/node-server';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import { db } from '../db/kysely.js';
import { wsClientIp } from '../rooms/clientIp.js';
import { assignHost, cancelGraceTimer, cancelJoinDeadline, handBackHost, onPlayerDisconnected, resumeIfPaused } from '../rooms/lifecycle.js';
import { checkWsJoinRateLimit } from '../rooms/ratelimit.js';
import { withRoomLock } from '../rooms/roomLock.js';
import { buildGameSnapshot, reportClipFailure, skipIntermission, startGame, submitGuess } from '../rooms/scheduler.js';
import { buildLobbyState, broadcastLobby } from '../rooms/snapshot.js';
import { banPlayer, kickPlayer, type ModerationResult, renameInLobby, setSoundActivated } from '../rooms/service.js';
import { addConnection, broadcast, connectedPlayerIds, removeConnection, socketFor } from './registry.js';

// Commands are tiny (a token, a name, a number), so cap incoming frames far below ws's 100 MiB default to
// bound the memory/CPU an unauthenticated client can force before validation. ws closes over-limit sockets.
const MAX_WS_PAYLOAD_BYTES = 16 * 1024;

// Per-socket session, populated once the join command binds it to a seat. `joining` guards the bind
// against concurrent join frames on the same socket.
interface Session {
  socket: WebSocket;
  playerId: string | null;
  roomId: string | null;
  joining: boolean;
  ip: string;
}

export function attachWebSocketHub(server: ServerType): void {
  // serve() runs over HTTP/1 here, so the handle is a node:http Server despite ServerType's http2 arm.
  const wss = new WebSocketServer({ server: server as Server, maxPayload: MAX_WS_PAYLOAD_BYTES });
  wss.on('connection', (socket, request) => {
    // Resolve the client IP once at upgrade for the per-IP join limiter. Never let resolution throw out of
    // this handler: fall back to a sentinel bucket key so an undeterminable IP is still rate-limited.
    let ip: string;
    try {
      ip = wsClientIp(request);
    } catch {
      ip = 'unknown';
    }
    const session: Session = { socket, playerId: null, roomId: null, joining: false, ip };
    socket.on('message', (raw) => {
      void onMessage(session, raw);
    });
    socket.on('close', () => {
      void onClose(session);
    });
    // ws emits 'error' then 'close'; the close handler does the cleanup.
    socket.on('error', () => undefined);
  });
}

function sendEvent(socket: WebSocket, event: ServerEvent): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

function sendError(socket: WebSocket, code: WireErrorCode, message: string): void {
  sendEvent(socket, { type: 'error', code, message });
}

async function onMessage(session: Session, raw: RawData): Promise<void> {
  let data: unknown;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    sendError(session.socket, 'bad_message', 'Malformed message');
    return;
  }
  const parsed = clientCommandSchema.safeParse(data);
  if (!parsed.success) {
    sendError(session.socket, 'bad_message', 'Unknown command');
    return;
  }
  const command = parsed.data;
  // A command body can throw on a genuine fault — e.g. a guess racing the guesser's own kick/ban inserts a
  // row referencing the just-deleted player and hits a foreign-key violation. The socket 'message' handler
  // invokes this with `void`, so an escaping rejection would be unhandled and crash the single authoritative
  // process, taking down every room. Contain it here: log and surface a generic error instead.
  try {
    if (command.type === 'join') {
      await handleJoin(session, command.sessionToken);
      return;
    }
    if (!session.playerId || !session.roomId) {
      sendError(session.socket, 'not_joined', 'Send a join command first');
      return;
    }
    await dispatch(session, session.playerId, session.roomId, command);
  } catch (err) {
    console.error('Command handling failed:', err);
    sendError(session.socket, 'internal', 'Something went wrong');
  }
}

async function handleJoin(session: Session, sessionToken: string): Promise<void> {
  // A socket binds to exactly one seat; a second join (including a concurrent frame — the `joining` flag is
  // set synchronously before the first await) would leave the first player a ghost in the registry.
  if (session.playerId || session.joining) {
    sendError(session.socket, 'already_joined', 'This connection is already bound to a player');
    return;
  }
  // Throttle the unauthenticated session_token lookup per IP — the REST /join route limits its own bucket,
  // but reconnects flow through here, so this is a separate, more generous bucket (env.WS_JOIN_RATE_LIMIT).
  if (!checkWsJoinRateLimit(session.ip)) {
    sendError(session.socket, 'rate_limited', 'Too many join attempts');
    session.socket.close();
    return;
  }
  session.joining = true;
  try {
    // Initial lookup only resolves the room (the lock key) and rejects an obviously bad token cheaply.
    const initial = await db.selectFrom('players').select('room_id').where('session_token', '=', sessionToken).executeTakeFirst();
    if (!initial) {
      sendError(session.socket, 'invalid_token', 'Unknown session token');
      session.socket.close();
      return;
    }
    await withRoomLock(initial.room_id, async () => {
      // Re-read the player and ban state under the lock: a kick/ban/grace-expiry serialized ahead of this
      // could have deleted the row or banned the IP between the initial read and the bind.
      const player = await db.selectFrom('players').select(['id', 'room_id', 'ip']).where('session_token', '=', sessionToken).executeTakeFirst();
      if (!player) {
        sendError(session.socket, 'invalid_token', 'Unknown session token');
        session.socket.close();
        return;
      }
      // A ban deletes the target's row but a second session from the same IP keeps a valid token; reject
      // its reconnect so the ban also covers the bypass.
      const banned = await db.selectFrom('banned_ips').select('ip').where('room_id', '=', player.room_id).where('ip', '=', player.ip).executeTakeFirst();
      if (banned) {
        sendError(session.socket, 'banned', 'You are banned from this room');
        session.socket.close();
        return;
      }
      // The socket may have closed during the awaits above; onClose no-ops before the session is bound, so
      // binding now would leave a dead socket registered as connected. Skip the bind and leave prior state
      // (a reconnect's grace timer, or nothing for a fresh join) intact.
      if (session.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const wasEmpty = connectedPlayerIds(player.room_id).size === 0;
      const previous = socketFor(player.id);
      // Supersede any prior connection: register the new socket first so the old socket's later close is
      // recognized as stale (socket identity no longer matches) and ignored by onClose.
      addConnection(player.id, player.room_id, session.socket);
      session.playerId = player.id;
      session.roomId = player.room_id;
      cancelGraceTimer(player.id);
      cancelJoinDeadline(player.id);
      if (previous && previous !== session.socket) {
        previous.close();
      }
      await db.updateTable('players').set({ disconnected_at: null }).where('id', '=', player.id).execute();
      await resumeIfPaused(player.room_id, wasEmpty);
      const lobby = await buildLobbyState(player.room_id, connectedPlayerIds(player.room_id));
      // The reconnecting socket alone gets the game state (per-socket, not broadcast) so its own countdown
      // resumes mid-phase without disrupting already-synced clients.
      const game = await buildGameSnapshot(player.room_id, player.id);
      sendEvent(session.socket, { type: 'snapshot', you: player.id, lobby, game });
      broadcast(player.room_id, { type: 'lobby', lobby });
    });
  } finally {
    session.joining = false;
  }
}

async function dispatch(session: Session, playerId: string, roomId: string, command: ClientCommand): Promise<void> {
  // Drop a frame from a socket that is no longer the player's registered connection: a supersede (reconnect
  // on a new socket) or a cleanup/kick eviction removes it from the registry, after which its command would
  // run — and broadcast/lobby reads — against rows that may already be gone.
  if (socketFor(playerId) !== session.socket) {
    return;
  }
  switch (command.type) {
    case 'setName':
      await withRoomLock(roomId, async () => {
        const result = await renameInLobby(playerId, command.name);
        if (!result.ok) {
          sendError(session.socket, result.error, 'Rename rejected');
          return;
        }
        await broadcastLobby(roomId);
      });
      return;
    case 'activateSound':
      await withRoomLock(roomId, async () => {
        await setSoundActivated(playerId);
        await broadcastLobby(roomId);
      });
      return;
    case 'kick':
      await withRoomLock(roomId, async () => {
        const result = await kickPlayer(playerId, command.playerId);
        await finishRemoval(session, roomId, command.playerId, result, 'kick');
      });
      return;
    case 'ban':
      await withRoomLock(roomId, async () => {
        const result = await banPlayer(playerId, command.playerId);
        await finishRemoval(session, roomId, command.playerId, result, 'ban');
      });
      return;
    case 'handBackHost':
      await withRoomLock(roomId, async () => {
        await handBackHost(playerId, roomId);
        await broadcastLobby(roomId);
      });
      return;
    case 'start': {
      // The scheduler functions self-lock (they are also driven by timers with no hub frame), so they are
      // called unwrapped here — a nested withRoomLock for the same room would deadlock.
      const result = await startGame(roomId, playerId, command.settings);
      if (!result.ok) {
        sendError(session.socket, result.error, 'Start rejected');
      }
      return;
    }
    case 'guess': {
      const result = await submitGuess(roomId, playerId, command.value, command.final ?? false);
      if (!result.ok) {
        sendError(session.socket, result.error, 'Guess rejected');
      }
      return;
    }
    case 'skipIntermission': {
      const result = await skipIntermission(roomId, playerId);
      if (!result.ok) {
        sendError(session.socket, result.error, 'Skip rejected');
      }
      return;
    }
    case 'reportClipFailure': {
      const result = await reportClipFailure(roomId, playerId, command.roundId);
      if (!result.ok) {
        sendError(session.socket, result.error, 'Clip failure rejected');
      }
      return;
    }
  }
}

async function finishRemoval(session: Session, roomId: string, targetId: string, result: ModerationResult, reason: 'kick' | 'ban'): Promise<void> {
  if (!result.ok) {
    sendError(session.socket, result.error, 'Moderation rejected');
    return;
  }
  const targetSocket = socketFor(targetId);
  removeConnection(targetId);
  cancelGraceTimer(targetId);
  cancelJoinDeadline(targetId);
  if (result.wasHost) {
    await assignHost(roomId, result.formerJoinOrder, connectedPlayerIds(roomId));
  }
  if (targetSocket) {
    sendEvent(targetSocket, { type: 'kicked', reason });
    targetSocket.close();
  }
  await broadcastLobby(roomId);
}

async function onClose(session: Session): Promise<void> {
  if (!session.playerId || !session.roomId) {
    return;
  }
  const { playerId, roomId } = session;
  await withRoomLock(roomId, async () => {
    // A superseded socket (the player already reconnected on a new socket) must not re-mark them
    // disconnected: the live registered socket is no longer this one.
    if (socketFor(playerId) !== session.socket) {
      return;
    }
    removeConnection(playerId);
    await onPlayerDisconnected(playerId, roomId);
  });
}
