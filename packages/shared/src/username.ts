import { RESERVED_USERNAMES, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from './constants.js';

const ALLOWED_CHARS = /^[A-Za-z0-9 _-]*$/;

export type UsernameError = 'empty' | 'invalid_chars' | 'too_short' | 'too_long' | 'reserved';

export type UsernameResult = { ok: true; name: string } | { ok: false; error: UsernameError };

/**
 * Normalize a raw username: trim ends and collapse runs of internal spaces to a
 * single space. Other characters are left untouched so validation can reject
 * disallowed ones.
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/ {2,}/g, ' ');
}

function isReserved(normalized: string): boolean {
  return (RESERVED_USERNAMES as readonly string[]).includes(normalized.toLowerCase());
}

/**
 * Validate a raw username against the allowed-character, length, and
 * reserved-name rules, returning the normalized form on success.
 */
export function validateUsername(raw: string): UsernameResult {
  const name = normalizeUsername(raw);
  if (name.length === 0) {
    return { ok: false, error: 'empty' };
  }
  if (!ALLOWED_CHARS.test(name)) {
    return { ok: false, error: 'invalid_chars' };
  }
  if (name.length < USERNAME_MIN_LENGTH) {
    return { ok: false, error: 'too_short' };
  }
  if (name.length > USERNAME_MAX_LENGTH) {
    return { ok: false, error: 'too_long' };
  }
  if (isReserved(name)) {
    return { ok: false, error: 'reserved' };
  }
  return { ok: true, name };
}
