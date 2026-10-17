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

// DESIGN 8.3-6: `surface({ sourcemap: 'hidden' })` maps client chunks back to the original
// TSX without a sourceMappingURL comment; the server bundle keeps its own map.
const clientFiles = await files(path.join(app, 'dist/client/assets'));
for (const file of clientFiles.filter(name => name.endsWith('.js')))
  assert.ok(
    !(await readFile(file, 'utf8')).includes('sourceMappingURL'),
    `${path.relative(app, file)} must not reference its hidden source map`
  );
const counterMap = clientFiles.find(name => /\/Counter-[\w-]+\.js\.map$/.test(name));
assert.ok(counterMap, 'the island chunk has a hidden source map');
const map = JSON.parse(await readFile(counterMap, 'utf8'));
const index = map.sources.findIndex(source => source.endsWith('routes/_components/Counter.tsx'));
assert.ok(index >= 0, `Counter.tsx is a source of ${path.basename(counterMap)}`);
assert.equal(
  map.sourcesContent[index],
  await readFile(path.join(app, 'routes/_components/Counter.tsx'), 'utf8'),
  'the map holds the original TSX'
);
assert.ok((await readFile(path.join(app, 'dist/server.mjs.map'), 'utf8')).includes('"sources"'));
console.log('8.3-6: hidden client source maps of the original TSX, server bundle map');

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
  /^\[state-surface\] \S+\/broken\/lib\/fmt\.ts:1:1: Server-only modules are reachable from the browser bundle/
);
// The location is the first server-only import, with its code frame.
assert.match(
  message,
  /> {4}1 \| import \{ connection \} from '\.\.\/server\/db\.server';\n {7}\| \^/
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
