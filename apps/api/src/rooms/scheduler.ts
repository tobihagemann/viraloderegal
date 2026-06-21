import {
  type GameSettings,
  type GameSnapshot,
  type PlayerGuess,
  type RoundPhase,
  type RoundResult,
  type RoundScore,
  type ServerEvent,
  type Standing,
  computeLeaderboard,
  scoreRound,
} from '@viraloderegal/shared';
import { type Kysely, type Transaction, sql } from 'kysely';
import { type DB, db } from '../db/kysely.js';
import { broadcast, connectedPlayerIds } from '../ws/registry.js';
import { buildLobbyState } from './snapshot.js';
import { checkGuessRateLimit } from './ratelimit.js';
import { nextPhase, phaseDurationSec } from './phaseMachine.js';
import { withRoomLock } from './roomLock.js';

type DbExecutor = Kysely<DB> | Transaction<DB>;

// A transition's effect to apply after its transaction commits: the events to broadcast and the next timer
// to arm (null ends the round chain, e.g. game over).
interface Outcome {
  events: ServerEvent[];
  next: { roundId: string; phase: RoundPhase; delayMs: number } | null;
}

interface ActiveRound {
  roundId: string;
  gameId: string;
  roundNo: number | null;
  youtubeId: string;
  clipStartSec: number;
  clipEndSec: number;
  viewCount: number | null;
  currentPhase: RoundPhase;
  phaseEndAt: Date | null;
  guessTimerSec: number;
  roundsTotal: number;
}

interface SelectedVideo {
  youtubeId: string;
  clipStartSec: number;
  clipEndSec: number;
  viewCount: number;
}

// Thrown to roll back a game-start transaction when the random pool is exhausted (returning would commit).
class NoVideosError extends Error {}

// The reveal numbers become public when the guesses are revealed; the sting before them is still suspense.
const REVEAL_VISIBLE_PHASES: RoundPhase[] = ['reveal_guesses', 'reveal_board', 'inter'];

// One phase timer per room, mirroring lifecycle.ts's graceTimers. Keyed by roomId and tagged with the
// round + phase it was scheduled for so a stale fire is recognized after the round-id+phase CAS.
const phaseTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; roundId: string; phase: RoundPhase }>();

export function clearPhaseTimer(roomId: string): void {
  const entry = phaseTimers.get(roomId);
  if (entry) {
    clearTimeout(entry.timer);
    phaseTimers.delete(roomId);
  }
}

function scheduleAdvance(roomId: string, roundId: string, phase: RoundPhase, delayMs: number): void {
  clearPhaseTimer(roomId);
  const timer = setTimeout(
    () => {
      void advancePhase(roomId, roundId, phase);
    },
    Math.max(0, delayMs),
  );
  phaseTimers.set(roomId, { timer, roundId, phase });
}

function applyOutcome(roomId: string, outcome: Outcome): void {
  for (const event of outcome.events) {
    broadcast(roomId, event);
  }
  if (outcome.next) {
    scheduleAdvance(roomId, outcome.next.roundId, outcome.next.phase, outcome.next.delayMs);
  } else {
    clearPhaseTimer(roomId);
  }
}

export type StartError = 'not_host' | 'not_startable' | 'already_active' | 'invalid_source' | 'not_ready' | 'no_videos';
export type StartResult = { ok: true } | { ok: false; error: StartError };

// First game or rematch. Self-locks (the hub calls this unwrapped) so it shares the per-room critical
// section with the timer-driven transitions.
export function startGame(roomId: string, hostId: string, settings: GameSettings): Promise<StartResult> {
  return withRoomLock(roomId, () => startGameLocked(roomId, hostId, settings));
}

async function startGameLocked(roomId: string, hostId: string, settings: GameSettings): Promise<StartResult> {
  // Fail closed: the curated-set source is not wired yet, so a game persisted as set-backed but populated
  // from the random pool would write inconsistent state.
  if (settings.source !== 'random') {
    return { ok: false, error: 'invalid_source' };
  }
  const room = await db.selectFrom('rooms').select('status').where('id', '=', roomId).executeTakeFirst();
  if (!room) {
    return { ok: false, error: 'not_startable' };
  }
  // Reject a redundant start on an already-running game: a second game would overwrite active_game_id and
  // spawn a second scheduler, which the phase CAS does not guard against. Only a fresh lobby or a finished
  // room (rematch) may start.
  if (room.status === 'active') {
    return { ok: false, error: 'already_active' };
  }
  if (room.status !== 'lobby' && room.status !== 'finished') {
    return { ok: false, error: 'not_startable' };
  }
  if (!(await isHost(roomId, hostId))) {
    return { ok: false, error: 'not_host' };
  }
  const lobby = await buildLobbyState(roomId, connectedPlayerIds(roomId));
  if (!lobby.canStart) {
    return { ok: false, error: 'not_ready' };
  }

  let outcome: Outcome;
  try {
    outcome = await db.transaction().execute(async (trx): Promise<Outcome> => {
      // game_no is monotonic per room; the per-room lock serializes rematch so max + 1 cannot race. The
      // games_room_id_game_no_key constraint remains the backstop.
      const max = await trx
        .selectFrom('games')
        .select((eb) => eb.fn.max('game_no').as('maxNo'))
        .where('room_id', '=', roomId)
        .executeTakeFirst();
      const game = await trx
        .insertInto('games')
        .values({
          room_id: roomId,
          game_no: (max?.maxNo ?? 0) + 1,
          source: 'random',
          curated_set_id: null,
          rounds_total: settings.roundsTotal,
          guess_timer_sec: settings.guessTimerSec,
          active_round_id: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const video = await selectRandomVideo(trx, game.id);
      // Throw to roll back the games insert: returning normally would commit it, leaving an orphan game
      // and burning a game_no on a start that never began.
      if (!video) {
        throw new NoVideosError();
      }
      const round = await beginClipRound(trx, game.id, 1, settings.roundsTotal, video);
      await trx.updateTable('rooms').set({ active_game_id: game.id, status: 'active' }).where('id', '=', roomId).execute();
      return round.outcome;
    });
  } catch (err) {
    if (err instanceof NoVideosError) {
      return { ok: false, error: 'no_videos' };
    }
    throw err;
  }
  applyOutcome(roomId, outcome);
  return { ok: true };
}

export type GuessResult = { ok: true } | { ok: false; error: 'window_closed' | 'rate_limited' };

export function submitGuess(roomId: string, playerId: string, value: number, final: boolean): Promise<GuessResult> {
  return withRoomLock(roomId, () => submitGuessLocked(roomId, playerId, value, final));
}

// In-memory per-round readiness: a player becomes ready when they commit a final guess and un-ready again if
// they keep editing (a draft). Once every connected player is ready the guess window ends early. Single
// authoritative process, so this mirrors the existing in-memory phase timers; it is cleared when the round
// leaves the guess phase.
const readyByRound = new Map<string, Set<string>>();

function setReady(roundId: string, playerId: string, ready: boolean): void {
  if (ready) {
    let set = readyByRound.get(roundId);
    if (!set) {
      set = new Set();
      readyByRound.set(roundId, set);
    }
    set.add(playerId);
  } else {
    readyByRound.get(roundId)?.delete(playerId);
  }
}

async function submitGuessLocked(roomId: string, playerId: string, value: number, final: boolean): Promise<GuessResult> {
  const round = await selectActiveRound(db, roomId);
  if (!round || round.currentPhase !== 'guess' || !round.phaseEndAt || Date.now() >= round.phaseEndAt.getTime()) {
    return { ok: false, error: 'window_closed' };
  }
  if (!checkGuessRateLimit(playerId)) {
    return { ok: false, error: 'rate_limited' };
  }
  await db
    .insertInto('guesses')
    .values({ round_id: round.roundId, player_id: playerId, guess: value })
    .onConflict((oc) => oc.columns(['round_id', 'player_id']).doUpdateSet({ guess: value, updated_at: new Date() }))
    .execute();
  setReady(round.roundId, playerId, final);
  if (final) {
    await advanceIfAllReady(roomId, round.roundId);
  }
  return { ok: true };
}

// End the guess window early once every connected player has committed — the same lock-free advance the
// intermission skip uses. Disconnected players cannot commit, so they are not awaited (a fully-empty room is
// already paused and never reaches here).
async function advanceIfAllReady(roomId: string, roundId: string): Promise<void> {
  const connected = connectedPlayerIds(roomId);
  if (connected.size === 0) {
    return;
  }
  const ready = readyByRound.get(roundId);
  if (!ready) {
    return;
  }
  for (const playerId of connected) {
    if (!ready.has(playerId)) {
      return;
    }
  }
  clearPhaseTimer(roomId);
  await advancePhaseLocked(roomId, roundId, 'guess');
}

export type SkipResult = { ok: true } | { ok: false; error: 'not_host' | 'not_intermission' };

export function skipIntermission(roomId: string, playerId: string): Promise<SkipResult> {
  return withRoomLock(roomId, () => skipIntermissionLocked(roomId, playerId));
}

async function skipIntermissionLocked(roomId: string, playerId: string): Promise<SkipResult> {
  if (!(await isHost(roomId, playerId))) {
    return { ok: false, error: 'not_host' };
  }
  const round = await selectActiveRound(db, roomId);
  if (!round || round.currentPhase !== 'inter') {
    return { ok: false, error: 'not_intermission' };
  }
  clearPhaseTimer(roomId);
  await advancePhaseLocked(roomId, round.roundId, 'inter');
  return { ok: true };
}

export type ClipFailureResult = { ok: true } | { ok: false; error: 'not_host' | 'invalid_round' };

export function reportClipFailure(roomId: string, playerId: string, roundId: string): Promise<ClipFailureResult> {
  return withRoomLock(roomId, () => reportClipFailureLocked(roomId, playerId, roundId));
}

async function reportClipFailureLocked(roomId: string, playerId: string, roundId: string): Promise<ClipFailureResult> {
  if (!(await isHost(roomId, playerId))) {
    return { ok: false, error: 'not_host' };
  }
  // Mirror advancePhase's pause guard: a command queued behind the lock could run after the room emptied;
  // do not re-arm a phase timer on a room that onPlayerDisconnected just paused.
  if (connectedPlayerIds(roomId).size === 0) {
    return { ok: false, error: 'invalid_round' };
  }
  const active = await selectActiveRound(db, roomId);
  // Idempotency: only the active round still in its clip phase can be reported failed. A duplicate or stale
  // report whose round was already replaced is a no-op, so it cannot cascade-skip the replacement clip.
  if (!active || active.roundId !== roundId || active.currentPhase !== 'clip') {
    return { ok: false, error: 'invalid_round' };
  }
  clearPhaseTimer(roomId);
  const outcome = await db.transaction().execute(async (trx): Promise<Outcome | null> => {
    const round = await selectActiveRound(trx, roomId);
    if (!round || round.roundId !== roundId || round.currentPhase !== 'clip' || round.roundNo === null) {
      return null;
    }
    await trx.updateTable('rounds').set({ state: 'skipped', round_no: null, phase_end_at: null }).where('id', '=', roundId).execute();
    const video = await selectRandomVideo(trx, round.gameId);
    if (!video) {
      return finalizeGame(trx, round.gameId, roomId);
    }
    const { outcome } = await beginClipRound(trx, round.gameId, round.roundNo, round.roundsTotal, video);
    return outcome;
  });
  if (outcome) {
    applyOutcome(roomId, outcome);
  }
  return { ok: true };
}

// Timer callback: re-enters the room lock (it holds none when fired from setTimeout).
async function advancePhase(roomId: string, expectedRoundId: string, expectedPhase: RoundPhase): Promise<void> {
  await withRoomLock(roomId, () => advancePhaseLocked(roomId, expectedRoundId, expectedPhase));
}

async function advancePhaseLocked(roomId: string, expectedRoundId: string, expectedPhase: RoundPhase): Promise<void> {
  // clearTimeout cannot stop a callback already fired and queued behind the lock, so re-check the room is
  // not in the all-disconnected pause before acting; the persisted phase_end_at is resumed on reconnect.
  if (connectedPlayerIds(roomId).size === 0) {
    return;
  }
  const outcome = await db.transaction().execute(async (trx): Promise<Outcome | null> => {
    const round = await selectActiveRound(trx, roomId);
    // CAS on round id + phase (not phase_end_at, which a timestamptz round-trip does not reliably preserve
    // and which two rounds can share after a clip swap): a mismatch means a skip/reconnect/replacement
    // already moved on, so the timer is stale.
    if (!round || round.roundId !== expectedRoundId || round.currentPhase !== expectedPhase) {
      return null;
    }
    // Scoring is written inside this same transaction so a crash cannot leave the phase advanced without
    // scores, or scores without the advance.
    if (expectedPhase === 'guess') {
      readyByRound.delete(round.roundId);
      await scoreAndPersist(trx, round, roomId);
    }
    const advance = nextPhase(expectedPhase);
    if (advance === 'round_complete') {
      if (round.roundNo !== null && round.roundNo < round.roundsTotal) {
        return startNextRound(trx, round, roomId);
      }
      await trx.updateTable('rounds').set({ state: 'completed', phase_end_at: null }).where('id', '=', round.roundId).execute();
      return finalizeGame(trx, round.gameId, roomId);
    }
    const durationSec = phaseDurationSec(advance, round.guessTimerSec, round.clipEndSec - round.clipStartSec);
    const phaseEndAt = new Date(Date.now() + durationSec * 1000);
    await trx.updateTable('rounds').set({ current_phase: advance, phase_end_at: phaseEndAt }).where('id', '=', round.roundId).execute();
    const event = await buildPhaseEvent(trx, advance, round, phaseEndAt);
    return { events: [event], next: { roundId: round.roundId, phase: advance, delayMs: durationSec * 1000 } };
  });
  if (outcome) {
    applyOutcome(roomId, outcome);
  }
}

// Insert a fresh clip round, point the game at it, and return the round event + clip-phase timer. Shared by
// game start, the next-round advance, and clip-failure replacement.
async function beginClipRound(
  trx: Transaction<DB>,
  gameId: string,
  roundNo: number,
  roundsTotal: number,
  video: SelectedVideo,
): Promise<{ roundId: string; outcome: Outcome }> {
  const delayMs = (video.clipEndSec - video.clipStartSec) * 1000;
  const phaseEndAt = new Date(Date.now() + delayMs);
  const round = await trx
    .insertInto('rounds')
    .values({
      game_id: gameId,
      round_no: roundNo,
      youtube_id: video.youtubeId,
      clip_start_sec: video.clipStartSec,
      clip_end_sec: video.clipEndSec,
      view_count_snapshot: video.viewCount,
      current_phase: 'clip',
      phase_end_at: phaseEndAt,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await trx.updateTable('games').set({ active_round_id: round.id }).where('id', '=', gameId).execute();
  const event: ServerEvent = {
    type: 'round',
    roundId: round.id,
    roundNo,
    roundsTotal,
    youtubeId: video.youtubeId,
    clipStartSec: video.clipStartSec,
    clipEndSec: video.clipEndSec,
    phase: 'clip',
    phaseEndAt: phaseEndAt.toISOString(),
  };
  return { roundId: round.id, outcome: { events: [event], next: { roundId: round.id, phase: 'clip', delayMs } } };
}

async function startNextRound(trx: Transaction<DB>, round: ActiveRound, roomId: string): Promise<Outcome> {
  await trx.updateTable('rounds').set({ state: 'completed', phase_end_at: null }).where('id', '=', round.roundId).execute();
  const video = await selectRandomVideo(trx, round.gameId);
  if (!video) {
    return finalizeGame(trx, round.gameId, roomId);
  }
  const nextRoundNo = (round.roundNo ?? 0) + 1;
  const { outcome } = await beginClipRound(trx, round.gameId, nextRoundNo, round.roundsTotal, video);
  return outcome;
}

async function finalizeGame(trx: Transaction<DB>, gameId: string, roomId: string): Promise<Outcome> {
  await trx.updateTable('games').set({ status: 'finished', active_round_id: null }).where('id', '=', gameId).execute();
  await trx.updateTable('rooms').set({ status: 'finished' }).where('id', '=', roomId).execute();
  const standings = await buildLeaderboard(trx, gameId);
  const rounds = await buildRoundResults(trx, gameId);
  return { events: [{ type: 'gameOver', standings, rounds }], next: null };
}

// Freeze the round's guesses against the full roster (null guess for non-submitters) and persist the
// scored result. onConflict doNothing makes a re-run idempotent against the (round_id, player_name) PK.
async function scoreAndPersist(trx: Transaction<DB>, round: ActiveRound, roomId: string): Promise<void> {
  const viewCount = requireSnapshot(round.viewCount, round.roundId);
  const players = await trx.selectFrom('players').select(['id', 'name']).where('room_id', '=', roomId).execute();
  const guesses = await trx.selectFrom('guesses').select(['player_id', 'guess']).where('round_id', '=', round.roundId).execute();
  const guessByPlayer = new Map(guesses.map((g) => [g.player_id, g.guess]));
  const idByName = new Map(players.map((p) => [p.name, p.id]));
  const playerGuesses: PlayerGuess[] = players.map((p) => ({ playerName: p.name, guess: guessByPlayer.get(p.id) ?? null }));
  for (const score of scoreRound(playerGuesses, viewCount)) {
    await trx
      .insertInto('round_scores')
      .values({
        round_id: round.roundId,
        player_id: idByName.get(score.playerName) ?? null,
        player_name: score.playerName,
        guess: score.guess,
        distance: score.distance,
        points: score.points,
        is_winner: score.isWinner,
      })
      .onConflict((oc) => oc.columns(['round_id', 'player_name']).doNothing())
      .execute();
  }
}

async function buildPhaseEvent(trx: Transaction<DB>, phase: RoundPhase, round: ActiveRound, phaseEndAt: Date): Promise<ServerEvent> {
  const iso = phaseEndAt.toISOString();
  if (phase === 'reveal_guesses') {
    const results = mapScores(await selectRoundScores(trx, round.roundId));
    return { type: 'reveal', viewCount: requireSnapshot(round.viewCount, round.roundId), results, phaseEndAt: iso };
  }
  if (phase === 'reveal_board') {
    return { type: 'leaderboard', standings: await buildLeaderboard(trx, round.gameId), phaseEndAt: iso };
  }
  return { type: 'phase', phase, phaseEndAt: iso };
}

async function buildLeaderboard(ex: DbExecutor, gameId: string, excludeRoundId?: string): Promise<Standing[]> {
  let query = ex
    .selectFrom('round_scores')
    .innerJoin('rounds', 'rounds.id', 'round_scores.round_id')
    .select(['round_scores.player_name as playerName', 'round_scores.points as points'])
    .where('rounds.game_id', '=', gameId);
  // The current round is scored at guess→reveal_sting, before its public reveal. Exclude it so a reconnect
  // during reveal_sting cannot read the round's outcome off the standings ahead of the reveal sequence.
  if (excludeRoundId) {
    query = query.where('round_scores.round_id', '!=', excludeRoundId);
  }
  return computeLeaderboard(await query.execute());
}

async function buildRoundResults(ex: DbExecutor, gameId: string): Promise<RoundResult[]> {
  const rounds = await ex
    .selectFrom('rounds')
    .select(['id', 'round_no', 'view_count_snapshot'])
    .where('game_id', '=', gameId)
    .where('round_no', 'is not', null)
    .where('state', '=', 'completed')
    .orderBy('round_no')
    .execute();
  const results: RoundResult[] = [];
  for (const round of rounds) {
    if (round.round_no === null) {
      continue;
    }
    results.push({
      roundNo: round.round_no,
      viewCount: requireSnapshot(round.view_count_snapshot, round.id),
      results: mapScores(await selectRoundScores(ex, round.id)),
    });
  }
  return results;
}

function selectRoundScores(ex: DbExecutor, roundId: string) {
  return ex.selectFrom('round_scores').select(['player_name', 'guess', 'distance', 'points', 'is_winner']).where('round_id', '=', roundId).execute();
}

function mapScores(rows: { player_name: string; guess: number | null; distance: number | null; points: number; is_winner: boolean }[]): RoundScore[] {
  return rows.map((r) => ({ playerName: r.player_name, guess: r.guess, distance: r.distance, points: r.points, isWinner: r.is_winner }));
}

// Draw a random eligible video the game has not used yet (skipped clips count as used so they are not
// redrawn). Returns null when the pool is exhausted, which drives an early game end. Without a YouTube
// client the snapshot refresh is unavailable, so this serves the existing view_count_snapshot and gates
// out videos that have none.
async function selectRandomVideo(ex: DbExecutor, gameId: string): Promise<SelectedVideo | null> {
  const video = await ex
    .selectFrom('videos')
    .select(['youtube_id', 'clip_start_sec', 'clip_end_sec', 'view_count_snapshot'])
    .where('enabled', '=', true)
    .where('random_eligible', '=', true)
    .where('view_count_snapshot', 'is not', null)
    .where('youtube_id', 'not in', (eb) => eb.selectFrom('rounds').select('youtube_id').where('game_id', '=', gameId))
    .orderBy(sql`random()`)
    .limit(1)
    .executeTakeFirst();
  if (!video || video.view_count_snapshot === null) {
    return null;
  }
  return { youtubeId: video.youtube_id, clipStartSec: video.clip_start_sec, clipEndSec: video.clip_end_sec, viewCount: video.view_count_snapshot };
}

// The room's active round of its active game, or undefined in the lobby / when finished. The inner joins on
// active_game_id and active_round_id mean a returned round is always the game's current authoritative round.
function selectActiveRound(ex: DbExecutor, roomId: string): Promise<ActiveRound | undefined> {
  return ex
    .selectFrom('rooms')
    .innerJoin('games', 'games.id', 'rooms.active_game_id')
    .innerJoin('rounds', 'rounds.id', 'games.active_round_id')
    .select([
      'rounds.id as roundId',
      'rounds.game_id as gameId',
      'rounds.round_no as roundNo',
      'rounds.youtube_id as youtubeId',
      'rounds.clip_start_sec as clipStartSec',
      'rounds.clip_end_sec as clipEndSec',
      'rounds.view_count_snapshot as viewCount',
      'rounds.current_phase as currentPhase',
      'rounds.phase_end_at as phaseEndAt',
      'games.guess_timer_sec as guessTimerSec',
      'games.rounds_total as roundsTotal',
    ])
    .where('rooms.id', '=', roomId)
    .where('games.status', '=', 'active')
    .where('rounds.state', '=', 'active')
    .executeTakeFirst();
}

async function isHost(roomId: string, playerId: string): Promise<boolean> {
  const player = await db.selectFrom('players').select('is_host').where('id', '=', playerId).where('room_id', '=', roomId).executeTakeFirst();
  return player?.is_host ?? false;
}

function requireSnapshot(viewCount: number | null, roundId: string): number {
  if (viewCount === null) {
    throw new Error(`round ${roundId} has no view_count_snapshot`);
  }
  return viewCount;
}

// First reconnect into a paused room reschedules the phase timer from the persisted phase_end_at: an
// elapsed deadline advances immediately, otherwise it fires for the remaining time. A lobby/finished room
// (or one with no active round) is a no-op. Lock-free: the only callers already hold the room lock
// (resumeIfPaused) or run during pre-serve rehydration where no concurrent room activity exists.
export async function resumeScheduler(roomId: string): Promise<void> {
  const round = await selectActiveRound(db, roomId);
  if (!round || !round.phaseEndAt) {
    return;
  }
  scheduleAdvance(roomId, round.roundId, round.currentPhase, round.phaseEndAt.getTime() - Date.now());
}

// Boot hook. reconcileOnStartup runs first and marks every player in active rooms disconnected, so on boot
// every active room is in the all-disconnected pause and no phase timer is started here; resumeScheduler
// restarts it on the first reconnect. This stays the named symmetry point and tolerates an unreachable DB.
export async function rehydrateSchedulers(): Promise<void> {
  try {
    await db.selectFrom('rooms').select('id').where('status', '=', 'active').limit(1).execute();
  } catch (err) {
    console.error('Scheduler rehydration skipped (database unreachable):', err);
  }
}

// The active-game portion of a reconnect snapshot. Null in the lobby. For an active game it carries the
// current phase/round, the cumulative leaderboard, the player's own guess, and any reveal already shown;
// for a finished room only the final standings + per-round history are populated.
export async function buildGameSnapshot(roomId: string, playerId: string): Promise<GameSnapshot | null> {
  const room = await db.selectFrom('rooms').select(['status', 'active_game_id']).where('id', '=', roomId).executeTakeFirst();
  if (!room || !room.active_game_id || (room.status !== 'active' && room.status !== 'finished')) {
    return null;
  }
  const game = await db.selectFrom('games').select(['id', 'rounds_total', 'active_round_id']).where('id', '=', room.active_game_id).executeTakeFirst();
  if (!game) {
    return null;
  }
  const standings = await buildLeaderboard(db, game.id);
  const rounds = await buildRoundResults(db, game.id);
  const empty: GameSnapshot = { phase: null, phaseEndAt: null, round: null, standings, yourGuess: null, reveal: null, rounds };
  if (room.status === 'finished' || !game.active_round_id) {
    return empty;
  }
  const round = await selectActiveRound(db, roomId);
  if (!round) {
    return empty;
  }
  const myGuess = await db.selectFrom('guesses').select('guess').where('round_id', '=', round.roundId).where('player_id', '=', playerId).executeTakeFirst();
  const reveal = REVEAL_VISIBLE_PHASES.includes(round.currentPhase)
    ? { viewCount: requireSnapshot(round.viewCount, round.roundId), results: mapScores(await selectRoundScores(db, round.roundId)) }
    : null;
  // The round is scored before its public reveal, so withhold it from the standings until the reveal runs.
  const liveStandings = round.currentPhase === 'reveal_sting' ? await buildLeaderboard(db, game.id, round.roundId) : standings;
  return {
    phase: round.currentPhase,
    phaseEndAt: round.phaseEndAt ? round.phaseEndAt.toISOString() : null,
    round: {
      roundId: round.roundId,
      roundNo: round.roundNo ?? 0,
      roundsTotal: game.rounds_total,
      youtubeId: round.youtubeId,
      clipStartSec: round.clipStartSec,
      clipEndSec: round.clipEndSec,
    },
    standings: liveStandings,
    yourGuess: myGuess?.guess ?? null,
    reveal,
    rounds,
  };
}
