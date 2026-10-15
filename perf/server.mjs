import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export async function startServer(port = 3200) {
  const origin = `http://127.0.0.1:${port}`;
  // Never silently measure an unrelated process already listening on our port.
  try {
    await fetch(origin, { signal: AbortSignal.timeout(500) });
    throw new Error(`Port ${port} is already in use`);
  } catch (error) {
    if (!['TypeError', 'TimeoutError'].includes(error.name)) throw error;
  }
  let output = '';
  const child = spawn(process.execPath, ['dist/server.js'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), BASE_PATH: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => {
    output += chunk;
  });
  child.stderr.on('data', chunk => {
    output += chunk;
  });
  let spawnError;
  child.on('error', error => {
    spawnError = error;
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    for (let i = 0; i < 50 && child.exitCode === null && child.signalCode === null; i++)
      await delay(100);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  };
  try {
    for (let i = 0; i < 100; i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      if (output.includes('StateSurface running')) {
        const response = await fetch(origin);
        if (response.ok && (await response.text()).includes('StateSurface'))
          return { origin, stop };
      }
      await delay(100);
    }
    throw new Error(`Server readiness timeout: ${output}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
