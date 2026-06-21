import { ref, type Ref, watch } from 'vue';

// A reactive ref mirrored to localStorage, so a value like the global mute flag survives a reload. Reads and
// writes are guarded: a private-mode or quota error degrades to an in-memory ref rather than throwing.
export function useStoredFlag(key: string, fallback: boolean): Ref<boolean> {
  const stored = safeGet(key);
  const state = ref(stored === null ? fallback : stored === 'true');
  watch(state, (value) => safeSet(key, String(value)));
  return state;
}

const TOKEN_PREFIX = 'vor:token:';

// The session token is keyed by room code so a reconnect re-joins the right seat and a different room's
// token never leaks across.
export function readSessionToken(code: string): string | null {
  return safeGet(TOKEN_PREFIX + code);
}

export function storeSessionToken(code: string, token: string): void {
  safeSet(TOKEN_PREFIX + code, token);
}

export function clearSessionToken(code: string): void {
  try {
    localStorage.removeItem(TOKEN_PREFIX + code);
  } catch {
    // ignore unavailable storage
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore unavailable storage
  }
}
