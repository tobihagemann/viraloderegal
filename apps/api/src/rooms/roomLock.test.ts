import { describe, expect, it } from 'vitest';
import { withRoomLock } from './roomLock.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('withRoomLock', () => {
  it('serializes operations on the same room in submission order despite their durations', async () => {
    const order: number[] = [];
    await Promise.all([
      withRoomLock('r', async () => {
        await delay(30);
        order.push(1);
      }),
      withRoomLock('r', async () => {
        await delay(10);
        order.push(2);
      }),
      withRoomLock('r', async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('propagates an operation error to its caller without breaking the queue', async () => {
    await expect(
      withRoomLock('r2', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const ran: string[] = [];
    await withRoomLock('r2', async () => {
      ran.push('after');
    });
    expect(ran).toEqual(['after']);
  });

  it('does not serialize across different rooms', async () => {
    const order: string[] = [];
    await Promise.all([
      withRoomLock('a', async () => {
        await delay(20);
        order.push('a');
      }),
      withRoomLock('b', async () => {
        order.push('b');
      }),
    ]);
    expect(order).toEqual(['b', 'a']);
  });

  it('resolves with the operation result', async () => {
    await expect(withRoomLock('r3', async () => 42)).resolves.toBe(42);
  });
});
