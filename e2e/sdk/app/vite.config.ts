import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { surface } from '../../../engine/vite.js';

// V-31 fixture: the Sentry and Datadog RUM browser SDKs (npm, or Loader and CDN snippet)
// and GTM next to the router, actions and plugins, under a nonce CSP.
const root = path.dirname(fileURLToPath(import.meta.url));
const engine = (file: string) => path.resolve(root, '../../../engine', file);

export default defineConfig({
  root,
  plugins: [surface()],
  logLevel: 'warn',
  build: { outDir: 'dist/client', manifest: true, emptyOutDir: true },
  ssr: { noExternal: ['lithent', 'state-surface'] },
  resolve: {
    alias: [
      { find: /^state-surface\/server$/, replacement: engine('server.ts') },
      { find: /^state-surface\/client$/, replacement: engine('client.ts') },
      { find: /^state-surface$/, replacement: engine('index.ts') },
    ],
  },
});
