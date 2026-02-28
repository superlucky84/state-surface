import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'state-surface': path.resolve(__dirname, 'engine/index.ts'),
    },
  },
  test: {
    env: {
      NODE_ENV: 'test',
    },
  },
});
