import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import { surface } from './engine/vite.js';
import { DEFAULT_LOCALE, LOCALES } from './shared/locales.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [surface({ i18n: { locales: [...LOCALES], defaultLocale: DEFAULT_LOCALE } })],
  resolve: {
    alias: [
      {
        find: /^state-surface\/server$/,
        replacement: path.resolve(__dirname, 'engine/server.ts'),
      },
      {
        find: /^state-surface\/client$/,
        replacement: path.resolve(__dirname, 'engine/client.ts'),
      },
      {
        find: /^state-surface$/,
        replacement: path.resolve(__dirname, 'engine/index.ts'),
      },
    ],
  },
  test: {
    env: {
      NODE_ENV: 'test',
    },
    exclude: ['node_modules', 'dist', 'scaffold/**', 'e2e/**'],
  },
});
