#!/usr/bin/env node
/**
 * Scaffold check (DC-16, IMPLEMENT 단계 8·10): pack state-surface, create apps from the
 * repository templates, install the packed tarball, then build, test, check and start each
 * app with its own `pnpm start` and run the browser e2e against the production server:
 * `e2e/scaffold/minimal.spec.ts` for the minimal template, the demo parity e2e
 * (`e2e/demo-parity`) for the demo template.
 *
 *   node scripts/scaffold-test.mjs [minimal:node demo:node minimal:bun …]
 *
 * Default: minimal and demo with the Node adapter. Bun and Deno start from PATH (or
 * BUN_BINARY / DENO_BINARY), Workers in local workerd (`wrangler dev`). Unit tests, check
 * and format run on the Node and Express apps; the other adapters' apps build and start.
 */
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cases = (
  process.argv.slice(2).length ? process.argv.slice(2) : ['minimal:node', 'demo:node']
).map(spec => {
  const [template, adapter = 'node'] = spec.split(':');
  return { template, adapter };
});
const work = mkdtempSync(path.join(os.tmpdir(), 'state-surface-scaffold-'));
const run = (command, args, cwd, env = {}) => {
  console.log(`\n$ ${[command, ...args].join(' ')}  (${path.relative(work, cwd) || '.'})`);
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
};

// Bun and Deno apps start with `bun` / `deno` from PATH, like a user's machine.
const binaries = [process.env.BUN_BINARY, process.env.DENO_BINARY].filter(Boolean);
const PATH = [...binaries.map(binary => path.dirname(binary)), process.env.PATH].join(
  path.delimiter
);

/** `pnpm start` of the generated app; resolves once `GET /` answers below 500. */
async function start(cwd, adapter, port) {
  const args = [
    'start',
    ...(adapter === 'cloudflare' ? ['--port', String(port), '--ip', '127.0.0.1'] : []),
  ];
  console.log(`\n$ pnpm ${args.join(' ')}  (${path.relative(work, cwd)}, PORT=${port})`);
  let logs = '';
  const server = spawn('pnpm', args, {
    cwd,
    env: {
      ...process.env,
      PATH,
      PORT: String(port),
      WRANGLER_SEND_METRICS: 'false',
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? path.join(work, '.config'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  server.stdout.on('data', data => (logs += data));
  server.stderr.on('data', data => (logs += data));
  const stop = async () => {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
    for (let i = 0; i < 30 && server.exitCode === null && server.signalCode === null; i++)
      await delay(100);
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {}
  };
  for (let attempt = 0; attempt < 300; attempt++) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(1000),
      });
      if (response.status >= 500) {
        await stop();
        throw new Error(`GET / answered ${response.status}\n${logs}`);
      }
      console.log(`GET / → ${response.status}`);
      return { stop, logs: () => logs };
    } catch (error) {
      if (String(error).includes('answered')) throw error;
      await delay(100);
    }
  }
  await stop();
  throw new Error(`The ${adapter} server did not start:\n${logs}`);
}

/** Browser e2e against the running app (Chromium from the repository's Playwright). */
function e2e(template, name, port) {
  const args =
    template === 'minimal'
      ? ['test', '-c', 'e2e/scaffold/playwright.config.ts']
      : template === 'demo'
        ? ['test', '--project=demo-parity', '--reporter=line']
        : undefined;
  if (!args) return;
  run(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', ...args, `--output=test-results/scaffold-${name}`],
    root,
    {
      E2E_EXTERNAL: '1',
      E2E_PORT: String(port),
      SCAFFOLD_PORT: String(port),
      BASE_PATH: '',
    }
  );
}

try {
  run('pnpm', ['pack', '--pack-destination', work], root);
  const tarball = path.join(
    work,
    readdirSync(work).find(file => file.endsWith('.tgz'))
  );
  let port = 3700;
  for (const { template, adapter } of cases) {
    const name = `${template}-${adapter}`;
    const app = path.join(work, name);
    run(
      process.execPath,
      [
        path.join(root, 'create-state-surface/bin/create-state-surface.js'),
        name,
        '--template',
        template,
        '--adapter',
        adapter,
        '--source',
        root,
        '--no-git',
      ],
      work,
      { STATE_SURFACE_VERSION: `file:${tarball}` }
    );
    run('pnpm', ['install', '--no-frozen-lockfile'], app);
    run('pnpm', ['build'], app);
    if (adapter === 'node' || adapter === 'express') {
      run('pnpm', ['test'], app);
      run('pnpm', ['check'], app);
      run('pnpm', ['format:check'], app);
    }
    const appPort = port++;
    const server = await start(app, adapter, appPort);
    try {
      e2e(template, name, appPort);
    } catch (error) {
      console.error(server.logs().slice(-4000));
      throw error;
    } finally {
      await server.stop();
    }
    console.log(`\nScaffold ${name}: install, build, start and browser e2e passed.`);
  }
} finally {
  if (!process.env.KEEP_SCAFFOLD) rmSync(work, { recursive: true, force: true });
  else console.log(`Kept ${work}`);
}
