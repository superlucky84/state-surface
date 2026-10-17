import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { check } from './check.js';

/** `state-surface check` (DESIGN 3.1 ③): every analysis problem of a project, no bundle. */
let root: string;
const write = async (file: string, code: string) => {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), code);
};

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'surface-check-'));
  await write(
    'vite.config.ts',
    `import { surface } from ${JSON.stringify(path.resolve('engine/vite.ts'))};\nexport default { plugins: [surface()] };\n`
  );
  await write('Title.tsx', 'export default () => <h1>Title</h1>;\n');
  await write(
    'Clock.tsx',
    "import { readFileSync } from 'node:fs';\nexport default () => <b>{String(readFileSync)}</b>;\n"
  );
  await write(
    'routes/index.tsx',
    [
      "import { Slot } from 'state-surface';",
      "import Title from '../Title';",
      "import Clock from '../Clock';",
      'export default function Page() {',
      '  return <html><body><Slot name="Main"><Title /></Slot><Clock client:idle /></body></html>;',
      '}',
    ].join('\n')
  );
  await write(
    'routes/about.tsx',
    [
      "import Title from '../Title';",
      'export default function About() {',
      '  return <html><body><Title client:load client:idle /></body></html>;',
      '}',
    ].join('\n')
  );
  await write('transitions/Bad Name.ts', 'export default async function* () {}\n');
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('state-surface check', () => {
  it('reports every problem with its location and fails', async () => {
    const lines: string[] = [];
    const code = await check({ root, types: false, log: line => lines.push(line) });
    const output = lines
      .join('\n')
      .split(root + path.sep)
      .join('<root>/');
    expect(code).toBe(1);
    expect(output).toContain('[state-surface] <root>/transitions/Bad Name.ts');
    expect(output).toContain(
      '[state-surface] <root>/routes/about.tsx:3:22: <Title>: use only one activation timing'
    );
    // The Slot name fails the page analysis; every module is still transformed.
    expect(output).toContain('[state-surface] <root>/routes/index.tsx:5:22: Slot name "Main"');
    expect(output).toContain('[state-surface] check: 3 problems');
  });

  it('passes a clean project and reports browser imports of server code', async () => {
    await write('transitions/Bad Name.ts', '');
    await rm(path.join(root, 'transitions/Bad Name.ts'));
    await write(
      'routes/index.tsx',
      [
        "import Clock from '../Clock';",
        'export default function Page() {',
        '  return <html><body><Clock client:idle /></body></html>;',
        '}',
      ].join('\n')
    );
    await write('routes/about.tsx', 'export default () => <html />;\n');
    const lines: string[] = [];
    expect(await check({ root, types: false, log: line => lines.push(line) })).toBe(1);
    expect(
      lines
        .join('\n')
        .split(root + path.sep)
        .join('<root>/')
    ).toContain(
      '[state-surface] <root>/Clock.tsx:1:1: "node:fs" is server-only and is reachable from the browser bundle: Clock.tsx → node:fs'
    );
    await write('Clock.tsx', 'export default () => <b>clock</b>;\n');
    const clean: string[] = [];
    expect(await check({ root, types: false, log: line => clean.push(line) })).toBe(0);
    expect(clean).toEqual(['[state-surface] check: analysis passed']);
  });
});
