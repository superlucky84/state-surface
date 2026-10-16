import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { surface } from './engine/vite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
});
