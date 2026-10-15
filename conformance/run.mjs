import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { scenarios } from './scenarios.mjs';
const adapter = process.argv[2] ?? 'node';
if (!['node', 'express', 'bun', 'deno', 'cloudflare'].includes(adapter))
  throw new Error('Unknown adapter');
const port = Number(process.env.CONFORMANCE_PORT ?? 3400);
const origin = `http://127.0.0.1:${port}`;
try {
  await fetch(origin, { signal: AbortSignal.timeout(500) });
  throw new Error(`Conformance port ${port} already in use`);
} catch (error) {
  if (!['TypeError', 'TimeoutError'].includes(error.name)) throw error;
}
const commands = {
  node: [process.execPath, [`dist/conformance/node.mjs`]],
  express: [process.execPath, [`dist/conformance/express.mjs`]],
  bun: [process.env.BUN_BINARY ?? 'bun', [`dist/conformance/bun.mjs`]],
  deno: [
    process.env.DENO_BINARY ?? 'deno',
    [
      'run',
      '--allow-net',
      '--allow-read=conformance/public',
      '--allow-env=PORT,RUNTIME',
      `dist/conformance/deno.mjs`,
    ],
  ],
  cloudflare: [
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--local',
      '--config',
      'conformance/wrangler.json',
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
    ],
  ],
};
let logs = '';
const [command, args] = commands[adapter];
const child = spawn(command, args, {
  env: {
    ...process.env,
    PORT: String(port),
    RUNTIME: adapter,
    WRANGLER_SEND_METRICS: 'false',
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? '/tmp/state-surface-config',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
child.stdout.on('data', data => {
  logs += data;
});
child.stderr.on('data', data => {
  logs += data;
});
let spawnError;
child.on('error', error => {
  spawnError = error;
});
try {
  let ready = false;
  for (let i = 0; i < 200; i++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(logs);
    try {
      const response = await fetch(origin + '/demo/', { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  if (!ready) throw new Error(`Startup timeout\n${logs}`);
  const count = await scenarios(origin, adapter);
  console.log(`${adapter}: ${count} conformance scenarios passed`);
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
    for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++)
      await delay(100);
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }
}
