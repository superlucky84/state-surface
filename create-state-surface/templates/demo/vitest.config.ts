import { defineConfig } from 'vitest/config';
import { surface } from 'state-surface/vite';
import { DEFAULT_LOCALE, LOCALES } from './shared/locales.js';

export default defineConfig({
  plugins: [surface({ i18n: { locales: [...LOCALES], defaultLocale: DEFAULT_LOCALE } })],
  test: { env: { NODE_ENV: 'test' } },
});
