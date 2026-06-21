import { describe, expect, it } from 'vitest';
import { toCookieHeader } from './adminInvites.js';

describe('toCookieHeader', () => {
  it('reduces each Set-Cookie to its name=value pair and joins them', () => {
    const setCookies = ['better-auth.session_token=abc.def%3D; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax', 'better-auth.csrf=xyz; Path=/; HttpOnly'];
    expect(toCookieHeader(setCookies)).toBe('better-auth.session_token=abc.def%3D; better-auth.csrf=xyz');
  });

  it('returns an empty string for no cookies', () => {
    expect(toCookieHeader([])).toBe('');
  });
});
