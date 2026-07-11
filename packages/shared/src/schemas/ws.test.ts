import { describe, expect, it } from 'vitest';
import { MAX_GUESS } from '../constants.js';
import { clientCommandSchema, guessCommandSchema, kickCommandSchema, revealPayloadSchema, roundResultSchema, serverEventSchema } from './ws.js';

const UUID = '00000000-0000-4000-8000-000000000000';

describe('guessCommandSchema', () => {
  it('accepts whole numbers within [0, MAX_GUESS]', () => {
    expect(guessCommandSchema.safeParse({ type: 'guess', value: 0 }).success).toBe(true);
    expect(guessCommandSchema.safeParse({ type: 'guess', value: MAX_GUESS }).success).toBe(true);
  });

  it('rejects negatives and non-integers', () => {
    expect(guessCommandSchema.safeParse({ type: 'guess', value: -1 }).success).toBe(false);
    expect(guessCommandSchema.safeParse({ type: 'guess', value: 1.5 }).success).toBe(false);
  });

  it('treats final as an optional boolean', () => {
    expect(guessCommandSchema.safeParse({ type: 'guess', value: 1, final: true }).success).toBe(true);
    expect(guessCommandSchema.safeParse({ type: 'guess', value: 1 }).success).toBe(true);
    expect(guessCommandSchema.safeParse({ type: 'guess', value: 1, final: 'yes' }).success).toBe(false);
  });
});

describe('kickCommandSchema', () => {
  it('requires a uuid playerId', () => {
    expect(kickCommandSchema.safeParse({ type: 'kick', playerId: UUID }).success).toBe(true);
    expect(kickCommandSchema.safeParse({ type: 'kick', playerId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('clientCommandSchema', () => {
  it('routes a known command by its type discriminator', () => {
    expect(clientCommandSchema.safeParse({ type: 'join', sessionToken: 'token' }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ type: 'activateSound' }).success).toBe(true);
  });

  it('routes the moderation and host commands', () => {
    expect(clientCommandSchema.safeParse({ type: 'ban', playerId: UUID }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ type: 'handBackHost' }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ type: 'setName', name: 'Alex' }).success).toBe(true);
  });

  it('routes the gameplay commands and requires a uuid for the clip-failure round', () => {
    expect(clientCommandSchema.safeParse({ type: 'start', settings: { source: 'random', roundsTotal: 5, guessTimerSec: 30 } }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ type: 'skipIntermission' }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ type: 'reportClipFailure', roundId: UUID }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ type: 'reportClipFailure', roundId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an unknown command type', () => {
    expect(clientCommandSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});

describe('serverEventSchema', () => {
  it('accepts a phase event with an ISO datetime', () => {
    expect(serverEventSchema.safeParse({ type: 'phase', phase: 'clip', phaseEndAt: '2026-06-20T12:00:00.000Z' }).success).toBe(true);
  });

  it('rejects a phase event with a non-ISO timestamp', () => {
    expect(serverEventSchema.safeParse({ type: 'phase', phase: 'clip', phaseEndAt: 'soon' }).success).toBe(false);
  });

  it('accepts an error event with a wire code and rejects a non-wire code', () => {
    expect(serverEventSchema.safeParse({ type: 'error', code: 'room_full', message: 'Room is full' }).success).toBe(true);
    // 'generic' is a client-only display code the SPA synthesizes; it must never be a valid wire payload.
    expect(serverEventSchema.safeParse({ type: 'error', code: 'generic', message: 'Something went wrong' }).success).toBe(false);
    // 'internal' is the sole generic server-error wire code; the near-duplicate 'internal_error' must never be a valid one.
    expect(serverEventSchema.safeParse({ type: 'error', code: 'internal', message: 'Something went wrong' }).success).toBe(true);
    expect(serverEventSchema.safeParse({ type: 'error', code: 'internal_error', message: 'Something went wrong' }).success).toBe(false);
  });

  it('accepts a snapshot event carrying the recipient id and a lobby state', () => {
    const lobby = {
      code: 'ABCDEF',
      status: 'lobby',
      players: [{ id: UUID, name: 'Alex', joinOrder: 0, isHost: true, soundActivated: false, connected: true }],
      canStart: false,
    };
    expect(serverEventSchema.safeParse({ type: 'snapshot', you: UUID, lobby }).success).toBe(true);
    expect(serverEventSchema.safeParse({ type: 'lobby', lobby }).success).toBe(true);
  });

  it('rejects a lobby event with a malformed roster entry', () => {
    const lobby = {
      code: 'ABCDEF',
      status: 'lobby',
      players: [{ id: 'not-a-uuid', name: 'Alex', joinOrder: 0, isHost: true, soundActivated: false, connected: true }],
      canStart: false,
    };
    expect(serverEventSchema.safeParse({ type: 'lobby', lobby }).success).toBe(false);
  });

  it('accepts a kicked event only with a known reason', () => {
    expect(serverEventSchema.safeParse({ type: 'kicked', reason: 'kick' }).success).toBe(true);
    expect(serverEventSchema.safeParse({ type: 'kicked', reason: 'ban' }).success).toBe(true);
    expect(serverEventSchema.safeParse({ type: 'kicked', reason: 'left' }).success).toBe(false);
  });

  it('accepts the gameplay events with their payloads', () => {
    const at = '2026-06-20T12:00:00.000Z';
    expect(
      serverEventSchema.safeParse({
        type: 'round',
        roundId: UUID,
        roundNo: 1,
        roundsTotal: 5,
        youtubeId: 'dQw4w9WgXcQ',
        clipStartSec: 43,
        clipEndSec: 53,
        phase: 'prepare',
        phaseEndAt: at,
      }).success,
    ).toBe(true);
    const results = [{ playerName: 'Alex', guess: 100, distance: 30, points: 1, isWinner: true }];
    expect(serverEventSchema.safeParse({ type: 'reveal', viewCount: 130, title: 'Never Gonna Give You Up', results, phaseEndAt: at }).success).toBe(true);
    const standings = [{ playerName: 'Alex', totalPoints: 1, rank: 1 }];
    expect(serverEventSchema.safeParse({ type: 'leaderboard', standings, phaseEndAt: at }).success).toBe(true);
    expect(serverEventSchema.safeParse({ type: 'gameOver', standings, rounds: [{ roundNo: 1, viewCount: 130, title: null, results }] }).success).toBe(true);
    expect(serverEventSchema.safeParse({ type: 'roomWarning', secondsRemaining: 60 }).success).toBe(true);
  });

  it('rejects a round event with a non-uuid roundId and a reveal carrying a malformed result', () => {
    const at = '2026-06-20T12:00:00.000Z';
    expect(
      serverEventSchema.safeParse({
        type: 'round',
        roundId: 'nope',
        roundNo: 1,
        roundsTotal: 5,
        youtubeId: 'x',
        clipStartSec: 1,
        clipEndSec: 4,
        phase: 'prepare',
        phaseEndAt: at,
      }).success,
    ).toBe(false);
    const badResults = [{ playerName: 'Alex', guess: 1.5, distance: 0, points: 1, isWinner: true }];
    expect(serverEventSchema.safeParse({ type: 'reveal', viewCount: 130, title: 'Never Gonna Give You Up', results: badResults, phaseEndAt: at }).success).toBe(
      false,
    );
  });

  it('accepts a snapshot carrying an active-game payload and a null game', () => {
    const lobby = {
      code: 'ABCDEF',
      status: 'active',
      players: [{ id: UUID, name: 'Alex', joinOrder: 0, isHost: true, soundActivated: true, connected: true }],
      canStart: false,
    };
    const game = {
      phase: 'guess',
      phaseEndAt: '2026-06-20T12:00:00.000Z',
      round: { roundId: UUID, roundNo: 1, roundsTotal: 5, youtubeId: 'dQw4w9WgXcQ', clipStartSec: 43, clipEndSec: 53 },
      standings: [{ playerName: 'Alex', totalPoints: 0, rank: 1 }],
      yourGuess: null,
      reveal: null,
      rounds: [],
    };
    expect(serverEventSchema.safeParse({ type: 'snapshot', you: UUID, lobby, game }).success).toBe(true);
    expect(serverEventSchema.safeParse({ type: 'snapshot', you: UUID, lobby, game: null }).success).toBe(true);
  });

  it('requires the nullable title on both the reveal payload and the round-result history', () => {
    // Both carry the title now: the reveal shows it live, and the end-screen recap shows it once the game is over.
    expect(revealPayloadSchema.safeParse({ viewCount: 130, results: [] }).success).toBe(false);
    expect(roundResultSchema.safeParse({ roundNo: 1, viewCount: 130, results: [] }).success).toBe(false);
    expect(roundResultSchema.safeParse({ roundNo: 1, viewCount: 130, title: 'Never Gonna Give You Up', results: [] }).success).toBe(true);
    expect(roundResultSchema.safeParse({ roundNo: 1, viewCount: 130, title: null, results: [] }).success).toBe(true);
  });
});
