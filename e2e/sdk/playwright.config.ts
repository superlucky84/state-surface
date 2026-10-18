import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// V-31 fixture (built by e2e/sdk/build.mjs, served by its Node adapter entry).
const app = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app');
const port = Number(process.env.SDK_PORT ?? 3170);

export default defineConfig({
  testDir: '.',
  testMatch: 'sdk.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}/`, ...devices['Desktop Chrome'] },
  webServer: {
    command: 'node dist/server.mjs',
    cwd: app,
    env: { NODE_ENV: 'production', PORT: String(port) },
    url: `http://127.0.0.1:${port}/a`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
