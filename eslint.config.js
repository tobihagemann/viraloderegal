import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import configPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', 'apps/web/dist/**', 'playwright-report/**', 'test-results/**', '.turbo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    // TypeScript already resolves identifiers, so the core rule double-reports; App.vue is a deliberate single-word name.
    files: ['**/*.ts', '**/*.vue'],
    rules: { 'no-undef': 'off', 'vue/multi-word-component-names': 'off' },
  },
  {
    // Kysely migrations take `Kysely<any>` so they stay frozen in time, decoupled from the evolving DB type.
    files: ['apps/api/migrations/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  configPrettier,
);
