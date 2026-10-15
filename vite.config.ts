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
    manifest: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'client/main.ts'),
        styles: path.resolve(__dirname, 'client/styles.css'),
      },
    },
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
