import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Stage 3 modes fixture (built by e2e/modes/build.mjs, served by its Node adapter entry).
const app = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app');
const port = Number(process.env.MODES_PORT ?? 3150);

export default defineConfig({
  testDir: '.',
  testMatch: 'modes.spec.ts',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}/`, ...devices['Desktop Chrome'] },
  webServer: {
    command: 'node dist/server.mjs',
    cwd: app,
    env: { NODE_ENV: 'production', PORT: String(port) },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
