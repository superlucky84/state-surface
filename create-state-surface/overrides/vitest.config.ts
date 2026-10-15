import { defineConfig } from 'vitest/config';
import { surface } from 'state-surface/vite';

export default defineConfig({
  plugins: [surface()],
  test: {
    env: {
      NODE_ENV: 'test',
    },
  },
});
