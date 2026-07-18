import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pool } from './kysely.js';

// Vitest runs DB-free, so drive the pool's 'connect'/'error' wiring with synthetic events — a real failover
// can't be reproduced here.
describe('pool error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a checked-out client error once, sanitized, without crashing the process', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = new EventEmitter();
    pool.emit('connect', client);
    expect(client.listenerCount('error')).toBe(1);

    // pg attaches the failed Client to the error on some paths; the handler must not leak those internals.
    const err = Object.assign(new Error('Connection terminated unexpectedly'), {
      client: { host: 'db.internal', user: 'svc', password: 's3cr3t' },
    });
    expect(() => client.emit('error', err)).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Postgres client error:', 'Connection terminated unexpectedly');
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('s3cr3t');
  });

  it("absorbs pg-pool's duplicate idle re-emit on the pool without crashing or double-logging", () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = new EventEmitter();
    pool.emit('connect', client);

    // An idle client's error reaches the per-client listener first, then pg-pool re-emits it on the pool.
    const err = new Error('terminating connection due to administrator command');
    client.emit('error', err);
    expect(() => pool.emit('error', err, client)).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
