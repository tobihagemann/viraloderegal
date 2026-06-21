import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@viraloderegal/shared';

// Pure candidate generator: builds one room code with uniform character selection (randomInt avoids the
// modulo bias of randomBytes % n). Uniqueness is owned by createRoom's insert-and-retry, not here, so
// there is no check-then-insert race.
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
