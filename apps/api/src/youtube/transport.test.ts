import { describe, expect, it } from 'vitest';
import { isLoopbackBaseUrl } from './transport.js';

describe('isLoopbackBaseUrl', () => {
  it('accepts http loopback roots (IPv4, bracketed IPv6, localhost), with or without a port or trailing slash', () => {
    expect(isLoopbackBaseUrl('http://127.0.0.1:3100')).toBe(true);
    expect(isLoopbackBaseUrl('http://127.0.0.1:3100/')).toBe(true);
    expect(isLoopbackBaseUrl('http://[::1]:3100')).toBe(true);
    expect(isLoopbackBaseUrl('http://localhost:3100')).toBe(true);
    expect(isLoopbackBaseUrl('http://localhost')).toBe(true);
  });

  it('rejects non-loopback hosts, https, credentials, non-root paths/queries, and unparseable input', () => {
    expect(isLoopbackBaseUrl('http://evil.example.com')).toBe(false);
    expect(isLoopbackBaseUrl('http://169.254.169.254')).toBe(false);
    expect(isLoopbackBaseUrl('https://localhost:3100')).toBe(false);
    expect(isLoopbackBaseUrl('http://user:pass@localhost:3100')).toBe(false);
    expect(isLoopbackBaseUrl('http://localhost:3100/videos')).toBe(false);
    expect(isLoopbackBaseUrl('http://localhost:3100/?x=1')).toBe(false);
    expect(isLoopbackBaseUrl('http://localhost:3100/#frag')).toBe(false);
    expect(isLoopbackBaseUrl('not a url')).toBe(false);
  });
});
