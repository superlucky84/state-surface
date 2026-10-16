import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { surface } from 'state-surface/vite';

const rawBase = process.env.BASE_PATH;
const base = rawBase ? `${rawBase.replace(/\/$/, '')}/` : '/';

export default defineConfig({
  plugins: [surface(), tailwindcss()],
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
