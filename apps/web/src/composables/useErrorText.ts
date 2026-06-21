import { useI18n } from 'vue-i18n';

// Extract a server error `code` from a parsed JSON response body, falling back to a generic code. The shared
// decoder for the project's `{ code }` error contract, used by every REST-driven view.
export function errorCode(data: unknown): string {
  return typeof data === 'object' && data !== null && 'code' in data && typeof (data as { code: unknown }).code === 'string'
    ? (data as { code: string }).code
    : 'generic';
}

// Resolve a server or validation error code to a localized message, trying the error and usernameError
// namespaces before falling back to a generic message. Codes arrive as plain strings (REST bodies, ws error
// events), so the lookup is dynamic and the typed t/te are widened here at the single boundary.
export function useErrorText() {
  const { t, te } = useI18n();
  const translate = t as (key: string) => string;
  const exists = te as (key: string) => boolean;
  return (code: string): string => {
    for (const namespace of ['error', 'usernameError', 'adminError']) {
      const key = `${namespace}.${code}`;
      if (exists(key)) {
        return translate(key);
      }
    }
    return translate('error.generic');
  };
}
