import { describe, expect, it } from 'vitest';
import { normalizeUsername, validateUsername } from './username.js';

describe('normalizeUsername', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeUsername('  Alice  ')).toBe('Alice');
  });

  it('collapses consecutive internal spaces to one', () => {
    expect(normalizeUsername('Al    ice')).toBe('Al ice');
  });
});

describe('validateUsername', () => {
  it('accepts a valid name and returns its normalized form', () => {
    expect(validateUsername('  Bob_the   Builder ')).toEqual({
      ok: true,
      name: 'Bob_the Builder',
    });
  });

  it('accepts letters, digits, spaces, hyphens, and underscores', () => {
    expect(validateUsername('a-b_c 9')).toEqual({ ok: true, name: 'a-b_c 9' });
  });

  it('rejects disallowed characters', () => {
    expect(validateUsername('hä?llo')).toEqual({ ok: false, error: 'invalid_chars' });
  });

  it('rejects names shorter than the minimum after normalization', () => {
    expect(validateUsername('ab')).toEqual({ ok: false, error: 'too_short' });
  });

  it('rejects names longer than the maximum', () => {
    expect(validateUsername('a'.repeat(21))).toEqual({ ok: false, error: 'too_long' });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateUsername('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects reserved names case-insensitively', () => {
    expect(validateUsername('HOST')).toEqual({ ok: false, error: 'reserved' });
    expect(validateUsername('ChatGPT')).toEqual({ ok: false, error: 'reserved' });
    expect(validateUsername('spielleitung')).toEqual({ ok: false, error: 'reserved' });
  });
});
