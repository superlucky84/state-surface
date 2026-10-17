import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * Stage 10: the demo parity e2e (`e2e/demo-parity`) against the production build of every
 * adapter. Build first with the same BASE_PATH:
 *
 *   pnpm build && pnpm build:adapter-app
 *   node e2e/adapters/run.mjs [node express bun deno cloudflare]
 *
 * Each adapter entry serves `dist/client`; Workers run in local workerd (wrangler dev).
 */
const basePath = process.env.BASE_PATH ?? '';
const adapters = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['node', 'express', 'bun', 'deno', 'cloudflare'];
const app = name => `dist/adapter-app/${name}/server.mjs`;
const commands = {
  node: port => [process.execPath, [app('node')]],
  express: port => [process.execPath, [app('express')]],
  bun: port => [process.env.BUN_BINARY ?? 'bun', [app('bun')]],
  deno: port => [process.env.DENO_BINARY ?? 'deno', ['run', '-A', app('deno')]],
  cloudflare: port => [
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--local',
      '--config',
      'e2e/adapters/wrangler.json',
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      ...(basePath ? ['--var', `BASE_PATH:${basePath}`] : []),
    ],
  ],
};

async function start(name, port) {
  const [command, args] = commands[name](port);
  let logs = '';
  const child = spawn(command, args, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      BASE_PATH: basePath,
      WRANGLER_SEND_METRICS: 'false',
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? '/tmp/state-surface-config',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.on('data', data => (logs += data));
  child.stderr.on('data', data => (logs += data));
  const url = `http://127.0.0.1:${port}${basePath}/`;
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`${name} exited:\n${logs}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000), redirect: 'manual' });
      if (response.status < 500) return { child, logs: () => logs };
    } catch {}
    await delay(100);
  }
  stop(child);
  throw new Error(`${name} did not start:\n${logs}`);
}

async function stop(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++)
    await delay(100);
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {}
}

const playwright = (port, name) =>
  new Promise(resolve => {
    const run = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--project=demo-parity',
        '--reporter=line',
        `--output=test-results/adapters-${name}`,
      ],
      {
        env: { ...process.env, E2E_EXTERNAL: '1', E2E_PORT: String(port), BASE_PATH: basePath },
        stdio: 'inherit',
      }
    );
    run.on('exit', code => resolve(code ?? 1));
  });

let port = Number(process.env.ADAPTER_E2E_PORT ?? 3600);
const failed = [];
for (const name of adapters) {
  const server = await start(name, ++port);
  console.log(`\n── ${name} (${basePath || '/'}) on port ${port}`);
  try {
    const code = await playwright(port, name);
    if (code !== 0) {
      failed.push(name);
      console.error(server.logs().slice(-4000));
    }
  } finally {
    await stop(server.child);
  }
}
if (failed.length) {
  console.error(`Demo e2e failed on: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nDemo e2e passed on ${adapters.join(', ')} (${basePath || 'no base path'}).`);
