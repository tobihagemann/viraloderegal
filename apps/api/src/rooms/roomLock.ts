// Per-room async mutex: a promise queue keyed by roomId that serializes every room-mutating operation
// (join-bind, rename, sound, moderation, host transfer, grace expiry, pause/resume). Because each such
// operation reads the in-memory registry and then awaits a DB transaction, running under the lock
// guarantees the registry cannot change between the read and the commit.
const tails = new Map<string, Promise<void>>();

export function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(roomId) ?? Promise.resolve();
  const run = previous.then(() => fn());
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(roomId, tail);
  void tail.then(() => {
    if (tails.get(roomId) === tail) {
      tails.delete(roomId);
    }
  });
  return run;
}
