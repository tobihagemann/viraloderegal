import { MIN_PLAYERS } from '@viraloderegal/shared';
import { describe, expect, it } from 'vitest';
import { computeLobbyState } from './snapshot.js';

const room = { code: 'ABCDEF', status: 'lobby' as const };

function player(id: string, joinOrder: number, soundActivated: boolean) {
  return { id, name: `p${joinOrder}`, join_order: joinOrder, is_host: joinOrder === 0, sound_activated: soundActivated };
}

describe('computeLobbyState', () => {
  it('orders the roster by join_order and reflects the connected set', () => {
    const players = [player('b', 1, true), player('a', 0, true)];
    const state = computeLobbyState(room, players, new Set(['a']));
    expect(state.players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(state.players.find((p) => p.id === 'a')?.connected).toBe(true);
    expect(state.players.find((p) => p.id === 'b')?.connected).toBe(false);
  });

  it('cannot start below the minimum number of connected players', () => {
    const players = Array.from({ length: MIN_PLAYERS }, (_, i) => player(String(i), i, true));
    const connected = new Set([players[0].id]);
    expect(computeLobbyState(room, players, connected).canStart).toBe(false);
  });

  it('cannot start while a connected player has not activated sound', () => {
    const players = [player('a', 0, true), player('b', 1, false)];
    expect(computeLobbyState(room, players, new Set(['a', 'b'])).canStart).toBe(false);
  });

  it('can start when enough connected players have all activated sound', () => {
    const players = [player('a', 0, true), player('b', 1, true)];
    expect(computeLobbyState(room, players, new Set(['a', 'b'])).canStart).toBe(true);
  });
});
