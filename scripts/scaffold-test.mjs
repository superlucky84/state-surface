#!/usr/bin/env node
/**
 * Scaffold check (DC-16, IMPLEMENT 단계 8): pack state-surface, create apps from the
 * repository templates, install the packed tarball, then build, test, check and start each
 * app and request its first page.
 *
 *   node scripts/scaffold-test.mjs [minimal:node demo:node …]
 *
 * Default: minimal and demo with the Node adapter. Other adapters build only (their runtimes
 * are checked by the conformance suite).
 */
import { execFileSync, spawn } from 'node:child_process';
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

async function smoke(cwd, port) {
  const server = spawn(process.execPath, ['dist/server.js'], {
    cwd,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' });
        if (response.status >= 500) throw new Error(`GET / answered ${response.status}`);
        console.log(`GET / → ${response.status}`);
        return;
      } catch (error) {
        if (String(error).includes('answered')) throw error;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    throw new Error('The server did not start');
  } finally {
    server.kill();
  }
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
    if (adapter !== 'node' && adapter !== 'express') continue;
    run('pnpm', ['test'], app);
    run('pnpm', ['check'], app);
    run('pnpm', ['format:check'], app);
    await smoke(app, port++);
    console.log(`\nScaffold ${name}: install, build, test, check and start passed.`);
  }
} finally {
  if (!process.env.KEEP_SCAFFOLD) rmSync(work, { recursive: true, force: true });
  else console.log(`Kept ${work}`);
}
