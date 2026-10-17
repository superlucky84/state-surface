import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { surface } from '../../engine/vite.js';
import { node } from '../../engine/adapters/node.js';

/**
 * V-28 dev/prod identity (DC-16 ④): the conformance fixture as a surface() app. The same
 * scenarios run against `vite` dev and against this app's production build.
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.BASE_PATH ? `${process.env.BASE_PATH.replace(/\/$/, '')}/` : '/';

export default defineConfig({
  root,
  base,
  logLevel: 'warn',
  plugins: [
    surface({
      adapter: node(),
      images: {
        widths: [640],
        formats: ['webp'],
        remotePatterns: [{ hostname: 'images.invalid' }],
      },
    }),
  ],
  build: { outDir: 'dist/client', manifest: true, emptyOutDir: true },
});
