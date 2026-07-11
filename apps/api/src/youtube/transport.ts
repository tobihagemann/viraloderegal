// Policy for the fake-transport base-URL override. requestVideoItem appends the real YOUTUBE_API_KEY to
// whatever base URL it builds, so an arbitrary override is a key-exfiltration/SSRF vector; the override must
// therefore point only at a loopback fake. Kept a pure predicate (no process.env) so it unit-tests in
// isolation without triggering env parse.

// WHATWG URL returns the IPv6 host with brackets (new URL('http://[::1]:3100').hostname === '[::1]'), so the
// literal is bracketed here too. localhost is admitted as the value the Playwright webServer sets (resolved
// to loopback in this harness).
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', '[::1]', 'localhost']);

/** Whether `raw` is a loopback http:// root URL (no credentials, path, query, or fragment) — the only base
 * URL the fake transport may point the key-bearing request at. */
export function isLoopbackBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTNAMES.has(url.hostname)) {
    return false;
  }
  return url.username === '' && url.password === '' && url.search === '' && url.hash === '' && url.pathname === '/';
}
