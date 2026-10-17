import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { surface } from 'state-surface/vite';
import { node } from 'state-surface/adapters/node';
import { DEFAULT_LOCALE, LOCALES } from './shared/locales.js';

// BASE_PATH=/demo mounts the app under a sub-path.
const base = process.env.BASE_PATH ? `${process.env.BASE_PATH.replace(/\/$/, '')}/` : '/';

export default defineConfig({
  // Pages live under routes/[lang]/: /en/…, /ko/… (DC-24 ⑤).
  plugins: [
    surface({
      adapter: node(),
      i18n: { locales: [...LOCALES], defaultLocale: DEFAULT_LOCALE },
    }),
    tailwindcss(),
  ],
  base,
  build: { outDir: 'dist/client', manifest: true },
});
