import { defineConfig, devices } from '@playwright/test';

// Stage 10: an app generated from the minimal template, already started by
// scripts/scaffold-test.mjs on its production server (any adapter).
const port = Number(process.env.SCAFFOLD_PORT ?? 3700);

export default defineConfig({
  testDir: '.',
  testMatch: 'minimal.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['line']],
  use: { baseURL: `http://127.0.0.1:${port}/`, ...devices['Desktop Chrome'] },
});
