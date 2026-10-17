import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { surface } from 'state-surface/vite';
import { node } from 'state-surface/adapters/node';

// BASE_PATH=/app mounts the app under a sub-path.
const base = process.env.BASE_PATH ? `${process.env.BASE_PATH.replace(/\/$/, '')}/` : '/';

export default defineConfig({
  // surface() finds pages (routes/), transitions (transitions/) and islands; the adapter
  // decides the server runtime.
  plugins: [surface({ adapter: node() }), tailwindcss()],
  base,
  build: { outDir: 'dist/client', manifest: true },
});
