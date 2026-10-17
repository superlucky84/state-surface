import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { surface } from './engine/vite.js';
import { DEFAULT_LOCALE, LOCALES } from './shared/locales.js';

const rawBase = process.env.BASE_PATH;
const base = rawBase ? `${rawBase.replace(/\/$/, '')}/` : '/';

export default defineConfig({
  // Pages live under routes/[lang]/: /en/…, /ko/… (DC-24 ⑤).
  plugins: [
    surface({ i18n: { locales: [...LOCALES], defaultLocale: DEFAULT_LOCALE } }),
    tailwindcss(),
  ],
  base,
  build: {
    outDir: 'dist/client',
    // Inputs (engine loader, client/styles.css, client/entry.ts) come from the surface plugin.
    manifest: true,
  },
  ssr: {
    noExternal: ['lithent', 'state-surface'],
  },
});
