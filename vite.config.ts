import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawBase = process.env.BASE_PATH;
const base = rawBase ? `${rawBase.replace(/\/$/, '')}/` : '/';

export default defineConfig({
  plugins: [tailwindcss()],
  base,
  resolve: {
    alias: {
      'state-surface': path.resolve(__dirname, 'engine/index.ts'),
    },
  },
});
