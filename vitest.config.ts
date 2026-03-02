import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
  test: {
    env: {
      NODE_ENV: 'test',
    },
  },
});
