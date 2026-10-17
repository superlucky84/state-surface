import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

/**
 * Stage 3 build checks (IMPLEMENT 단계 3 Baseline):
 * - builds the mode fixture app (client + Node server) for e2e/modes/modes.spec.ts,
 * - V-05: no server-only sentinel anywhere in the client output,
 * - a client island that reaches server-only modules fails the build with the import chain.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, 'app');
const broken = path.join(here, 'broken');

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(entry =>
      entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
    )
  );
  return nested.flat();
}

await build({ root: app, configFile: path.join(app, 'vite.config.ts') });
await build({
  root: app,
  configFile: path.join(app, 'vite.config.ts'),
  build: {
    ssr: path.join(app, 'server/main.ts'),
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'server.mjs' } },
  },
});

const server = await readFile(path.join(app, 'dist/server.mjs'), 'utf8');
for (const sentinel of ['SENTINEL-SERVER-FILE-7f3a2c', 'SENTINEL-SERVER-MARKER-91c2be']) {
  assert.ok(server.includes(sentinel), `server bundle should use ${sentinel}`);
  for (const file of await files(path.join(app, 'dist/client'))) {
    const text = await readFile(file, 'utf8');
    assert.ok(!text.includes(sentinel), `${sentinel} leaked into ${path.relative(app, file)}`);
  }
}
console.log('V-05: server-only sentinels absent from every client output file');

// DC-25: content is built into the server bundle; prerendered HTML shows it, scripts never do.
const contentSentinel = 'SENTINEL-CONTENT-4d1e9a';
assert.ok(server.includes(contentSentinel), 'server bundle should include content');
for (const file of await files(path.join(app, 'dist/client'))) {
  if (file.endsWith('.html')) continue;
  const text = await readFile(file, 'utf8');
  assert.ok(!text.includes(contentSentinel), `content leaked into ${path.relative(app, file)}`);
}
assert.ok(
  (await readFile(path.join(app, 'dist/client/content/intro/index.html'), 'utf8')).includes(
    contentSentinel
  ),
  'prerendered content page should contain its text'
);
console.log('V-05: content only in the server bundle and prerendered HTML');

let failure;
try {
  await build({
    root: broken,
    configFile: path.join(broken, 'vite.config.ts'),
    logLevel: 'silent',
  });
} catch (error) {
  failure = error;
}
assert.ok(failure, 'client build reaching server-only modules must fail');
const message = String(failure.message);
assert.match(
  message,
  /^\[state-surface\] Server-only modules are reachable from the browser bundle/
);
assert.equal(message.match(/\[state-surface\]/g).length, 1, message);
assert.match(
  message,
  /\n {2}routes\/_components\/Chart\.tsx → lib\/fmt\.ts → server\/db\.server\.ts\n/,
  message
);
assert.match(
  message,
  /\n {2}routes\/_components\/Gauge\.tsx → lib\/secret\.ts → state-surface\/server-only\n/,
  message
);
console.log('Server-only import chains reported:\n' + message);
