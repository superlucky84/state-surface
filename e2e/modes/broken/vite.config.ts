import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { surface } from '../../../engine/vite.js';

// Build failure fixture: a client island reaches server-only modules.
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
