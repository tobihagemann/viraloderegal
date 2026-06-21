import { describe, expect, it } from 'vitest';
import { MAX_GUESS } from '../constants.js';
import { clientCommandSchema, guessCommandSchema, kickCommandSchema, serverEventSchema } from './ws.js';

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

  it('accepts an error event with a code and message', () => {
    expect(serverEventSchema.safeParse({ type: 'error', code: 'room_full', message: 'Room is full' }).success).toBe(true);
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
});
