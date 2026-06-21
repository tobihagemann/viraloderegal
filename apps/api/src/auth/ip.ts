// The app resolves the trusted client IP (rightmost X-Forwarded-For under TRUST_PROXY, else the socket peer)
// and injects it on this header before handing the request to better-auth, whose own IP detection otherwise
// reads the spoofable leftmost X-Forwarded-For entry. better-auth is configured to key its rate limiter off
// this header so it sees the same trusted address the rest of the app does.
export const TRUSTED_IP_HEADER = 'x-trusted-ip';
