import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@viraloderegal/shared';
import { describe, expect, it } from 'vitest';
import { generateRoomCode } from './codes.js';

describe('generateRoomCode', () => {
  it('produces a code of the configured length using only alphabet characters', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect([...code].every((char) => ROOM_CODE_ALPHABET.includes(char))).toBe(true);
    }
  });
});
