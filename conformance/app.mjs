import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'vite';
import { scenarios } from './scenarios.mjs';

/**
 * V-28 dev/prod identity (DC-16 ④): the conformance scenarios against the surface() app in
 * conformance/app, once on the `vite` dev server and once on its production build (Node
 * adapter). Both use the app's surface.server.ts handler options.
 *
 *   node conformance/app.mjs [dev|prod]   (default: both)
 */
const app = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app');
const modes = process.argv[2] ? [process.argv[2]] : ['dev', 'prod'];
const env = { ...process.env, BASE_PATH: '/demo', RUNTIME: 'node' };

async function start(mode, port) {
  if (mode === 'prod') {
    process.env.BASE_PATH = '/demo';
    const configFile = path.join(app, 'vite.config.ts');
    await build({ root: app, configFile });
    await build({
      root: app,
      configFile,
      build: { ssr: 'server.ts', outDir: 'dist', emptyOutDir: false },
    });
  }
  const [command, args] =
    mode === 'dev'
      ? [
          process.execPath,
          [path.resolve('node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'],
        ]
      : [process.execPath, ['dist/server.js']];
  let logs = '';
  const child = spawn(command, args, {
    cwd: app,
    env: { ...env, PORT: String(port), NODE_ENV: mode === 'dev' ? 'development' : 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.on('data', data => (logs += data));
  child.stderr.on('data', data => (logs += data));
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      const response = await fetch(origin + '/demo/', { signal: AbortSignal.timeout(1000) });
      if (response.ok) return { child, origin, html: await response.text(), logs: () => logs };
    } catch {}
    await delay(100);
  }
  throw new Error(`Startup timeout\n${logs}`);
}

const stop = async child => {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++)
    await delay(100);
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {}
};

let port = Number(process.env.CONFORMANCE_PORT ?? 3450);
const results = {};
for (const mode of modes) {
  const server = await start(mode, port++);
  try {
    const bootstrap = JSON.parse(server.html.match(/id="__SURFACE__"[^>]*>(.*?)<\/script>/s)[1]);
    results[mode] = await scenarios(server.origin, 'node', {
      app: true,
      development: mode === 'dev',
      buildId: bootstrap.buildId,
    });
    console.log(`app ${mode}: ${results[mode]} conformance scenarios passed`);
  } catch (error) {
    console.error(server.logs());
    throw error;
  } finally {
    await stop(server.child);
  }
}
if (results.dev !== undefined && results.prod !== undefined && results.dev !== results.prod)
  throw new Error(`dev ran ${results.dev} scenarios, prod ${results.prod}`);
