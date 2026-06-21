import { describe, expect, it } from 'vitest';
import { resolveClientIp } from './clientIp.js';

describe('resolveClientIp', () => {
  it('uses the rightmost X-Forwarded-For entry when proxy is trusted', () => {
    expect(resolveClientIp(true, '198.51.100.7, 203.0.113.1', '10.0.0.1')).toBe('203.0.113.1');
  });

  it('falls back to the peer address when proxy is not trusted', () => {
    expect(resolveClientIp(false, '198.51.100.7', '10.0.0.1')).toBe('10.0.0.1');
  });

  it('falls back to the peer address when the header is absent even if trusted', () => {
    expect(resolveClientIp(true, undefined, '10.0.0.1')).toBe('10.0.0.1');
  });
});
