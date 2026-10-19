// Loopback policy for env-configured URLs. The YouTube fake transport may only point its key-bearing request
// at a loopback base URL, since requestVideoItem appends the real YOUTUBE_API_KEY to it. The production auth
// origin must not be loopback, since better-auth trusts only that origin. Kept pure predicates (no
// process.env) so they unit-test in isolation without triggering env parse.

// WHATWG URL returns the IPv6 host with brackets (new URL('http://[::1]:3100').hostname === '[::1]'), so the
// literal is bracketed here too.
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', '[::1]', 'localhost']);

/** Whether `hostname`, in WHATWG URL's bracketed-IPv6 form, is one of the listed loopback names. */
export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

/** Whether `raw` is a loopback http:// root URL (no credentials, path, query, or fragment). */
export function isLoopbackBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' || !isLoopbackHostname(url.hostname)) {
    return false;
  }
  return url.username === '' && url.password === '' && url.search === '' && url.hash === '' && url.pathname === '/';
}
