import { defineConfig, devices } from '@playwright/test';

const basePath = process.env.BASE_PATH ?? '';
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}/`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'demo-parity', testMatch: '**/demo-parity/**/*.spec.ts' },
    { name: 'spikes', testMatch: '**/spikes.spec.ts' },
  ],
  // E2E_EXTERNAL: a server started by e2e/adapters/run.mjs (any adapter) is already listening.
  webServer: process.env.E2E_EXTERNAL
    ? undefined
    : {
        command: 'node dist/server.js',
        env: { NODE_ENV: 'production', PORT: String(port), BASE_PATH: basePath },
        url: `http://127.0.0.1:${port}${basePath}/`,
        reuseExistingServer: false,
        timeout: 30_000,
      },
});
