import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { actionTypes, scanTransitions } from './transitionScanner.js';

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let root: string;

async function file(relative: string, content = 'export default async function* () {}\n') {
  const full = path.join(root, relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'surface-transitions-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('scanTransitions (DC-16 ③)', () => {
  it('names transitions by their path and skips helpers, tests and declarations', async () => {
    await file('transitions/search.ts');
    await file('transitions/comment/add.ts');
    await file('transitions/comment/add-reply.ts');
    await file('transitions/_helpers.ts');
    await file('transitions/_lib/db.ts');
    await file('transitions/search.test.ts');
    await file('transitions/types.d.ts', 'export {};\n');
    const found = await scanTransitions(path.join(root, 'transitions'));
    expect(found.map(transition => transition.name)).toEqual([
      'comment/add-reply',
      'comment/add',
      'search',
    ]);
  });

  it('rejects names that are not kebab-case and duplicate names', async () => {
    await file('transitions/commentAdd.ts');
    await expect(scanTransitions(path.join(root, 'transitions'))).rejects.toThrow(
      'invalid name "commentAdd"'
    );
    await rm(path.join(root, 'transitions'), { recursive: true });
    await file('transitions/search.ts');
    await file('transitions/search.js');
    await expect(scanTransitions(path.join(root, 'transitions'))).rejects.toThrow(
      'both register "search"'
    );
  });
});

describe('.state-surface/actions.d.ts (DC-22 ⑤)', () => {
  it('types useAction and <Boot> from the transitions without importing handler code', async () => {
    await file(
      'transitions/comment/add.ts',
      `import { defineTransition } from 'state-surface/server';
import type { StandardSchema } from 'state-surface/server';
declare const input: StandardSchema<{ postId: string; body: string }, { postId: string; body: string }>;
export default defineTransition({
  input,
  targets: ['comments:list'],
  async *handler({ postId, body }) {
    yield { type: 'state', states: { 'comments:list': { postId, body } } };
  },
});
`
    );
    await file('transitions/search.ts');
    const transitions = await scanTransitions(path.join(root, 'transitions'));
    const declaration = actionTypes(root, transitions);
    expect(declaration).not.toMatch(/^import (?!type)/m);
    await file('.state-surface/actions.d.ts', declaration);
    await file(
      'usage.tsx',
      `import { useAction } from 'state-surface/client';
import { Boot, actionUrl } from 'state-surface';
declare const renew: () => boolean;
const add = useAction(renew, 'comment/add');
void add.run({ postId: 'p1', body: 'hi' });
const search = useAction(renew, 'search');
void search.run({ anything: 1 });
void actionUrl('comment/add');
void Boot({ transition: 'search', params: { q: 'x' } });
// @ts-expect-error unknown transition name
useAction(renew, 'comment/remove');
// @ts-expect-error params follow the input schema
void add.run({ postId: 1 });
// @ts-expect-error unknown transition name
void actionUrl('nope');
// @ts-expect-error unknown transition name
void Boot({ transition: 'nope' });
`
    );
    const program = ts.createProgram({
      rootNames: [path.join(root, 'usage.tsx'), path.join(root, '.state-surface/actions.d.ts')],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: 'lithent',
        types: [],
        baseUrl: root,
        typeRoots: [path.join(engine, '..', 'node_modules', '@types')],
        paths: {
          'state-surface': [path.join(engine, 'index.ts')],
          'state-surface/server': [path.join(engine, 'server.ts')],
          'state-surface/client': [path.join(engine, 'client.ts')],
          lithent: [path.join(engine, '..', 'node_modules', 'lithent')],
          'lithent/*': [path.join(engine, '..', 'node_modules', 'lithent', '*')],
        },
      },
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter(diagnostic => diagnostic.file?.fileName.startsWith(root))
      .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    expect(diagnostics).toEqual([]);
  }, 60_000);
});
