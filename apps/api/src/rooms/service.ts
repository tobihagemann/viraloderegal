import { MAX_PLAYERS, type UsernameError, validateUsername } from '@viraloderegal/shared';
import { isUniqueViolation } from '../db/constraints.js';
import { db } from '../db/kysely.js';
import { generateRoomCode } from './codes.js';
import { ROOM_CODE_MAX_ATTEMPTS } from './constants.js';
import { generateSessionToken } from './tokens.js';

export type CreateRoomResult = { ok: true; code: string; sessionToken: string } | { ok: false; error: UsernameError };

export async function createRoom({ name, ip }: { name: string; ip: string }): Promise<CreateRoomResult> {
  const validation = validateUsername(name);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const sessionToken = generateSessionToken();
  // The rooms.code UNIQUE constraint is the authority: insert a candidate and retry the whole transaction
  // with a fresh code on collision rather than checking first (which would race).
  for (let attempt = 0; attempt < ROOM_CODE_MAX_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    try {
      await db.transaction().execute(async (trx) => {
        const room = await trx.insertInto('rooms').values({ code, active_game_id: null, status: 'lobby' }).returning('id').executeTakeFirstOrThrow();
        await trx
          .insertInto('players')
          .values({
            room_id: room.id,
            name: validation.name,
            join_order: 0,
            ip,
            is_host: true,
            session_token: sessionToken,
            sound_activated: false,
            disconnected_at: null,
          })
          .execute();
      });
      return { ok: true, code, sessionToken };
    } catch (err) {
      if (isUniqueViolation(err, 'rooms_code_key')) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to generate a unique room code');
}

export type JoinRoomError = UsernameError | 'not_found' | 'not_joinable' | 'banned' | 'room_full' | 'name_taken';
export type JoinRoomResult = { ok: true; sessionToken: string } | { ok: false; error: JoinRoomError };

export async function joinRoom({ code, name, ip }: { code: string; name: string; ip: string }): Promise<JoinRoomResult> {
  const validation = validateUsername(name);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const sessionToken = generateSessionToken();
  try {
    // FOR UPDATE on the room serializes concurrent joins into the same room (no per-room mutex exists at
    // the REST layer), so the capacity check, join_order, and insert cannot race.
    const result = await db.transaction().execute(async (trx): Promise<JoinRoomResult> => {
      const room = await trx.selectFrom('rooms').select(['id', 'status']).where('code', '=', code).forUpdate().executeTakeFirst();
      if (!room) {
        return { ok: false, error: 'not_found' };
      }
      if (room.status !== 'lobby') {
        return { ok: false, error: 'not_joinable' };
      }
      const banned = await trx.selectFrom('banned_ips').select('ip').where('room_id', '=', room.id).where('ip', '=', ip).executeTakeFirst();
      if (banned) {
        return { ok: false, error: 'banned' };
      }
      // Count retained rows, not live sockets: a disconnected player keeps its seat until grace expiry.
      const players = await trx.selectFrom('players').select(['join_order']).where('room_id', '=', room.id).execute();
      if (players.length >= MAX_PLAYERS) {
        return { ok: false, error: 'room_full' };
      }
      const nextOrder = players.reduce((max, p) => Math.max(max, p.join_order), -1) + 1;
      await trx
        .insertInto('players')
        .values({
          room_id: room.id,
          name: validation.name,
          join_order: nextOrder,
          ip,
          session_token: sessionToken,
          sound_activated: false,
          disconnected_at: null,
        })
        .execute();
      return { ok: true, sessionToken };
    });
    return result;
  } catch (err) {
    if (isUniqueViolation(err, 'players_room_id_lower_name_key')) {
      return { ok: false, error: 'name_taken' };
    }
    throw err;
  }
}

export type RenameError = UsernameError | 'not_in_lobby' | 'name_taken';
export type RenameResult = { ok: true } | { ok: false; error: RenameError };

export async function renameInLobby(playerId: string, name: string): Promise<RenameResult> {
  const validation = validateUsername(name);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  try {
    return await db.transaction().execute(async (trx): Promise<RenameResult> => {
      const player = await trx
        .selectFrom('players')
        .innerJoin('rooms', 'rooms.id', 'players.room_id')
        .select('rooms.status as status')
        .where('players.id', '=', playerId)
        .executeTakeFirst();
      if (!player || player.status !== 'lobby') {
        return { ok: false, error: 'not_in_lobby' };
      }
      await trx.updateTable('players').set({ name: validation.name }).where('id', '=', playerId).execute();
      return { ok: true };
    });
  } catch (err) {
    if (isUniqueViolation(err, 'players_room_id_lower_name_key')) {
      return { ok: false, error: 'name_taken' };
    }
    throw err;
  }
}

export async function setSoundActivated(playerId: string): Promise<void> {
  await db.updateTable('players').set({ sound_activated: true }).where('id', '=', playerId).execute();
}

export type ModerationError = 'not_host' | 'not_found';
export type ModerationResult = { ok: true; wasHost: boolean; formerJoinOrder: number } | { ok: false; error: ModerationError };

export function kickPlayer(hostId: string, targetId: string): Promise<ModerationResult> {
  return removePlayer(hostId, targetId, false);
}

export function banPlayer(hostId: string, targetId: string): Promise<ModerationResult> {
  return removePlayer(hostId, targetId, true);
}

// Authorize the caller as host, delete the target, and for a ban persist (room_id, ip) read from the
// target's row (the ws side has no access to the live upgrade request). Returns whether the target was
// host so the caller can run host transfer.
async function removePlayer(hostId: string, targetId: string, ban: boolean): Promise<ModerationResult> {
  // The host cannot moderate themselves (they leave by disconnecting); allowing it could empty a room
  // without marking it abandoned or transferring host.
  if (hostId === targetId) {
    return { ok: false, error: 'not_found' };
  }
  return db.transaction().execute(async (trx): Promise<ModerationResult> => {
    const host = await trx.selectFrom('players').select(['is_host', 'room_id']).where('id', '=', hostId).executeTakeFirst();
    if (!host?.is_host) {
      return { ok: false, error: 'not_host' };
    }
    const target = await trx.selectFrom('players').select(['is_host', 'join_order', 'ip', 'room_id']).where('id', '=', targetId).executeTakeFirst();
    if (!target || target.room_id !== host.room_id) {
      return { ok: false, error: 'not_found' };
    }
    await trx.deleteFrom('players').where('id', '=', targetId).execute();
    if (ban) {
      await trx
        .insertInto('banned_ips')
        .values({ room_id: host.room_id, ip: target.ip })
        .onConflict((oc) => oc.columns(['room_id', 'ip']).doNothing())
        .execute();
    }
    return { ok: true, wasHost: target.is_host, formerJoinOrder: target.join_order };
  });
}
