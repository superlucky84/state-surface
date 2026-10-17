import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SurfaceAnalyzer } from './app.js';
import { SurfaceBuildError } from './diagnostics.js';
import { compileMdx, inMdxSource } from './mdx.js';
import { scanTransitions } from './transitionScanner.js';
import { transformSurface } from './transform.js';

/**
 * Plugin diagnostics (DESIGN 3.1): one fixture project per rule, run through the same steps
 * as the build (page analysis, then the call-site transform of every module). Every message
 * has the `[state-surface]` prefix, the source `file:line:column`, a code frame and a hint.
 */

const ENGINE = path.resolve('engine');
const PACKAGES: Record<string, string> = {
  'state-surface/content': path.join(ENGINE, 'content.ts'),
};

const component = (name: string, body = `<b>${name}</b>`) =>
  `export default function ${name}(props: { text?: string }) { return ${body}; }`;
const serverComponent = [
  "import { defineServerComponent } from 'state-surface/server';",
  'export default defineServerComponent({ load: async () => ({ n: 1 }), render: ({ n }) => <b>{n}</b> });',
].join('\n');
const page = (body: string, imports = "import A from '../A';\nimport B from '../B';") =>
  [
    "import { Slot } from 'state-surface';",
    imports,
    '',
    'export default function Page() {',
    '  return (',
    '    <html>',
    '      <body>',
    `        ${body}`,
    '      </body>',
    '    </html>',
    '  );',
    '}',
  ].join('\n');
const base = { 'A.tsx': component('A'), 'B.tsx': component('B') };

const FIXTURES: Record<string, Record<string, string>> = {
  'Slot with two children': {
    ...base,
    'routes/index.tsx': page('<Slot name="hero"><A /><B /></Slot>'),
  },
  'Slot with text': { ...base, 'routes/index.tsx': page('<Slot name="hero">Welcome</Slot>') },
  'Slot child with children': {
    ...base,
    'routes/index.tsx': page('<Slot name="hero"><A><B /></A></Slot>'),
  },
  'directive on the Slot child': {
    ...base,
    'routes/index.tsx': page('<Slot name="hero"><A client:load /></Slot>'),
  },
  'Slot child and component': {
    ...base,
    'routes/index.tsx': page('<Slot name="hero" component={B}><A /></Slot>'),
  },
  'computed island': {
    ...base,
    'routes/index.tsx': page(
      '<parts.A client:load />',
      "import { Slot } from 'state-surface';\nimport * as parts from '../parts';"
    ),
  },
  'island not imported': {
    ...base,
    'routes/index.tsx': page('<Local client:idle />'),
  },
  'client directive on an HTML element': {
    ...base,
    'routes/index.tsx': page('<div client:visible />'),
  },
  'Slot inside a Slot': {
    ...base,
    'routes/index.tsx': page('<Slot name="outer"><Slot name="inner"><A /></Slot></Slot>'),
  },
  'Slot in a Slot fallback': {
    ...base,
    'routes/index.tsx': page(
      '<Slot name="chart" client:only fallback={<Slot name="x"><B /></Slot>}><A /></Slot>'
    ),
  },
  'Slot in island children': {
    ...base,
    'routes/index.tsx': page('<A client:idle><Slot name="x"><B /></Slot></A>'),
  },
  'component that renders a Slot': {
    ...base,
    'Panel.tsx': [
      "import { Slot } from 'state-surface';",
      "import A from './A';",
      'export default function Panel() {',
      '  return <Slot name="inner"><A /></Slot>;',
      '}',
    ].join('\n'),
    'routes/index.tsx': page(
      '<Slot name="panel"><Panel /></Slot>',
      "import { Slot } from 'state-surface';\nimport Panel from '../Panel';"
    ),
  },
  'Slot name format': { ...base, 'routes/index.tsx': page('<Slot name="Hero Title"><A /></Slot>') },
  'Slot name with #': { ...base, 'routes/index.tsx': page('<Slot name="list#1"><A /></Slot>') },
  'Slot name declared twice on a page': {
    ...base,
    'layouts/Layout.tsx': [
      "import { Slot } from 'state-surface';",
      "import A from '../A';",
      'export default function Layout(_: unknown, children: unknown) {',
      '  return <html><body><Slot name="page:title"><A /></Slot>{children}</body></html>;',
      '}',
    ].join('\n'),
    'routes/index.tsx': page(
      '<Layout><Slot name="page:title"><B /></Slot></Layout>',
      "import { Slot } from 'state-surface';\nimport Layout from '../layouts/Layout';\nimport B from '../B';"
    ),
  },
  'route collision': {
    ...base,
    'routes/docs.tsx': page('<A />'),
    'routes/docs/index.tsx': page('<B />'),
  },
  'page without default export': {
    'routes/index.tsx': 'export const prerender = true;\nexport function Page() {}\n',
  },
  'mode and client directive': {
    ...base,
    'routes/index.tsx': page('<Slot name="hero" mode="server" client:load><A /></Slot>'),
  },
  'two activation timings': {
    ...base,
    'routes/index.tsx': page('<A client:load client:idle />'),
  },
  'unknown directive': { ...base, 'routes/index.tsx': page('<A client:hover />') },
  'swap on a static slot': {
    ...base,
    'routes/index.tsx': page('<Slot name="hero" swap="morph"><A /></Slot>'),
  },
  'server:defer without mode="server"': {
    ...base,
    'routes/index.tsx': page('<Slot name="hero" server:defer><A /></Slot>'),
  },
  'external slot without schema': {
    ...base,
    'routes/index.tsx': page('<Slot name="agent" mode="server" external><A /></Slot>'),
  },
  'defineServerComponent as an island': {
    'Stats.tsx': serverComponent,
    'routes/index.tsx': page('<Stats client:load />', "import Stats from '../Stats';"),
  },
  'defineServerComponent in a static slot': {
    'Stats.tsx': serverComponent,
    'routes/index.tsx': page(
      '<Slot name="stats"><Stats /></Slot>',
      "import { Slot } from 'state-surface';\nimport Stats from '../Stats';"
    ),
  },
  'defineServerComponent in markup': {
    'Stats.tsx': serverComponent,
    'routes/index.tsx': page('<main><Stats /></main>', "import Stats from '../Stats';"),
  },
  '<Boot> in a client component': {
    'Starter.tsx': [
      "import { Boot } from 'state-surface';",
      'export default function Starter() {',
      '  return <div><Boot transition="load" /></div>;',
      '}',
    ].join('\n'),
    'routes/index.tsx': page('<Starter client:load />', "import Starter from '../Starter';"),
  },
  'persist on a server slot': {
    ...base,
    'routes/index.tsx': page('<Slot name="cart" mode="server" transition:persist><A /></Slot>'),
  },
  'persist on an island without a name': {
    ...base,
    'routes/index.tsx': page('<A client:load transition:persist />'),
  },
  'persist name used twice': {
    ...base,
    'routes/index.tsx': page(
      '<A client:load transition:persist="player" /><video transition:persist="player" />'
    ),
  },
  'persist-props without persist': {
    ...base,
    'routes/index.tsx': page('<A client:load transition:persist-props />'),
  },
  'plugins that are not imported': {
    ...base,
    'routes/index.tsx':
      page('<A />', "import A from '../A';") + '\nexport const plugins = [makePlugin()];\n',
  },
  'island inside MDX content (source position)': {
    'content/docs/intro.mdx': [
      '---',
      'title: Intro',
      '---',
      "import * as parts from '../../parts';",
      '',
      '# Intro',
      '',
      'Some text.',
      '',
      '<parts.Counter client:load />',
    ].join('\n'),
    'routes/index.tsx': page(
      '<main />',
      "import { getCollection } from 'state-surface/content';\nexport const docs = getCollection;"
    ),
  },
  'Slot inside MDX content (source position)': {
    'A.tsx': component('A'),
    'content/docs/intro.mdx': [
      "import { Slot } from 'state-surface';",
      "import A from '../../A';",
      '',
      '# Intro',
      '',
      '<Slot name="x"><A /></Slot>',
    ].join('\n'),
    'routes/index.tsx': page(
      '<main />',
      "import { getCollection } from 'state-surface/content';\nexport const docs = getCollection;"
    ),
  },
};

async function resolverFor(root: string, files: Set<string>) {
  return async (source: string, importer: string) => {
    if (PACKAGES[source]) return PACKAGES[source];
    if (!source.startsWith('.')) return undefined;
    const target = path.resolve(path.dirname(importer), source);
    return [target, `${target}.tsx`, `${target}.ts`, `${target}.mdx`].find(file => files.has(file));
  };
}

/** Runs the fixture like the build and returns the thrown diagnostic. */
async function diagnose(fixture: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'surface-diagnostics-'));
  try {
    const files = new Set<string>();
    for (const [name, code] of Object.entries(fixture)) {
      const file = path.join(root, name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, code);
      files.add(file);
    }
    const analyzer = new SurfaceAnalyzer(root, ENGINE, await resolverFor(root, files));
    try {
      await analyzer.app();
      for (const file of [...files].sort()) {
        const source = await readFile(file, 'utf8');
        if (file.endsWith('.mdx')) {
          const compiled = await compileMdx(source, file);
          await transformSurface(compiled.code, file, analyzer).catch(async error => {
            throw await inMdxSource(error, source, file, compiled);
          });
          const analysis = await analyzer.module(file);
          if (analysis?.slots.length)
            throw await inMdxSource(
              new SurfaceBuildError('<Slot> cannot be used in .mdx content.', {
                file,
                code: compiled.code,
                offset: analysis.slots[0].offset,
                hint: 'MDX renders inside page markup: declare Slots and <Boot> in the page; islands are allowed.',
              }),
              source,
              file,
              compiled
            );
        } else if (file.endsWith('.tsx')) await transformSurface(source, file, analyzer);
      }
    } catch (error) {
      if (!(error instanceof SurfaceBuildError)) throw error;
      const clean = (text: string) => text.split(root + path.sep).join('<root>/');
      return {
        error,
        report: clean(`${error.message}\n${error.frame ?? '(no frame)'}`),
      };
    }
    return undefined;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('plugin diagnostics (DESIGN 3.1)', () => {
  it.each(Object.keys(FIXTURES))('%s', async name => {
    const result = await diagnose(FIXTURES[name]);
    expect(result, 'the fixture must fail').toBeDefined();
    const { error, report } = result!;
    // Prefix, source location, code frame with a caret, and a hint.
    expect(report).toMatch(/^\[state-surface\] <root>\/\S+:\d+:\d+: /);
    expect(error.loc).toBeDefined();
    expect(error.frame).toMatch(/\n {7}\| \s*\^/);
    expect(error.hint).toBeTruthy();
    expect(report).toMatchSnapshot();
  });

  it('maps MDX positions to the .mdx source line', async () => {
    const { error } = (await diagnose(FIXTURES['island inside MDX content (source position)']))!;
    expect(error.loc).toMatchObject({ line: 10 });
    expect(error.frame).toContain('>   10 | <parts.Counter client:load />');
  });

  it('reports duplicate transition names at the second file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'surface-transitions-'));
    try {
      const handler = 'export default async function* () {}\n';
      // Sorted: cart.mts registers "cart" first, cart.ts is reported.
      await writeFile(path.join(root, 'cart.mts'), handler);
      await writeFile(path.join(root, 'cart.ts'), '// cart\n' + handler);
      const error = await scanTransitions(root).catch(caught => caught as SurfaceBuildError);
      expect(error).toBeInstanceOf(SurfaceBuildError);
      expect((error as SurfaceBuildError).loc).toMatchObject({ line: 2, column: 0 });
      expect((error as SurfaceBuildError).hint).toContain('rename or remove one file');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
