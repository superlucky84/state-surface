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
    noExternal: ['lithent'],
  },
  resolve: {
    alias: {
      'state-surface': path.resolve(__dirname, 'engine/index.ts'),
    },
  },
});
