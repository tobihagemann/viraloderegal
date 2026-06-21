import { createI18n } from 'vue-i18n';
import { de, type MessageSchema } from './locales/de.js';

// German-only for now, but Composition-mode and a typed message schema keep it ready for more locales.
export const i18n = createI18n<[MessageSchema], 'de'>({
  legacy: false,
  locale: 'de',
  fallbackLocale: 'de',
  messages: { de },
});
