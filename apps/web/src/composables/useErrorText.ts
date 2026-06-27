import { useI18n } from 'vue-i18n';
import { DISPLAY_ERROR_CODES, type DisplayErrorCode } from '@viraloderegal/shared';
// ERROR_NAMESPACES is the single source for the namespaces this lookup scans; importing it from the guard also
// keeps the guard's compile-time i18n-coverage assertion in the build graph (every DisplayErrorCode must have a
// German message or be on the intentionally-generic allow-list).
import { ERROR_NAMESPACES } from './errorTextGuard.js';

// Coerce an untyped/dynamic string (a REST body's code, a URL query handoff) to a DisplayErrorCode, falling
// back to 'generic' for anything outside the shared vocabulary. This is the single coercion point every dynamic
// code path routes through; the cast back to DisplayErrorCode fires only on the matched membership branch, so
// it is runtime-guarded and sound.
export function toDisplayErrorCode(raw: string): DisplayErrorCode {
  return (DISPLAY_ERROR_CODES as readonly string[]).includes(raw) ? (raw as DisplayErrorCode) : 'generic';
}

// Extract a server error `code` from a parsed JSON response body, validating it against the shared vocabulary
// and falling back to a generic code. The shared decoder for the project's `{ code }` error contract.
export function errorCode(data: unknown): DisplayErrorCode {
  return typeof data === 'object' && data !== null && 'code' in data && typeof (data as { code: unknown }).code === 'string'
    ? toDisplayErrorCode((data as { code: string }).code)
    : 'generic';
}

// Resolve a server or validation error code to a localized message, scanning the ERROR_NAMESPACES in order
// before falling back to a generic message. Codes are narrowed to DisplayErrorCode at their boundaries (REST
// bodies, ws error events, URL handoffs), so the lookup keys off the shared vocabulary; the typed t/te are
// widened here at the single string boundary.
export function useErrorText() {
  const { t, te } = useI18n();
  const translate = t as (key: string) => string;
  const exists = te as (key: string) => boolean;
  return (code: DisplayErrorCode): string => {
    for (const namespace of ERROR_NAMESPACES) {
      const key = `${namespace}.${code}`;
      if (exists(key)) {
        return translate(key);
      }
    }
    return translate('error.generic');
  };
}
