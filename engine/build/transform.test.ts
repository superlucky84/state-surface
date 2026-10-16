import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { SurfaceAnalyzer, type FactsCache } from './app.js';
import { analyzeModule } from './analyze.js';
import { transformSurface } from './transform.js';

const root = '/app';
const COMPONENTS: Record<string, string> = {
  '/app/components/Title.tsx': 'export default ({ text }: { text: string }) => <h1>{text}</h1>;',
  '/app/components/Like.tsx':
    'export function Like({ count }: { count: number }) { return <b>{count}</b>; }',
  '/app/components/Cart.tsx': [
    "import { defineServerComponent } from 'state-surface/server';",
    'export default defineServerComponent({ load: async () => ({}), render: () => <ul /> });',
  ].join('\n'),
  '/app/components/Nested.tsx': [
    "import { Slot } from 'state-surface';",
    "import Title from './Title';",
    'export default () => <Slot name="inner"><Title text="x" /></Slot>;',
  ].join('\n'),
  '/app/components/Boots.tsx': [
    "import { Boot } from 'state-surface';",
    'export default () => <div><Boot transition="go" /></div>;',
  ].join('\n'),
  '/app/components/HasIsland.tsx': [
    "import { Like } from './Like';",
    'export default () => <div><Like count={1} client:load /></div>;',
  ].join('\n'),
};

/** In-memory project: relative imports resolve to the files above; packages stay external. */
function analyzer(extra: Record<string, string> = {}) {
  const files = { ...COMPONENTS, ...extra };
  const facts: FactsCache = new Map();
  for (const [file, code] of Object.entries(files))
    facts.set(
      file,
      Promise.resolve().then(() => analyzeModule(code, file))
    );
  return new SurfaceAnalyzer(
    root,
    '/engine',
    async (source, importer) => {
      if (!source.startsWith('.')) return undefined;
      const base = path.posix.join(path.posix.dirname(importer), source);
      return [base, `${base}.tsx`, `${base}.ts`].find(file => file in files);
    },
    facts
  );
}

const PAGE = '/app/routes/index.tsx';
const transform = (code: string, extra?: Record<string, string>) =>
  transformSurface(code, PAGE, analyzer(extra));

describe('call-site transform', () => {
  it('turns directive islands and Slot children into descriptors', async () => {
    const code = [
      "import { Slot } from 'state-surface';",
      "import Title from '../components/Title';",
      "import { Like as Heart } from '../components/Like';",
      "import Cart from '../components/Cart';",
      'export default async function Page() {',
      '  const props = { text: "hi" };',
      '  return (',
      '    <main>',
      '      <Slot name="page:title" data-animate="fade">',
      '        <Title {...props} />',
      '      </Slot>',
      '      <Slot name="page:empty" component={Title} />',
      '      <Slot name="cart" mode="server"><Cart userId="u1" /></Slot>',
      '      <Heart count={1} client:idle>',
      '        <p>static child</p>',
      '      </Heart>',
      '    </main>',
      '  );',
      '}',
    ].join('\n');
    const result = await transform(code);
    expect(result!.code).toMatchSnapshot();
    expect(result!.map.mappings.length).toBeGreaterThan(0);
    expect(result!.map.sources).toEqual([PAGE]);
  });

  it('leaves modules without islands untouched', async () => {
    expect(await transform('export default () => <div class="x">plain</div>;')).toBeNull();
  });
});

describe('build diagnostics', () => {
  const cases: Array<[string, string, string]> = [
    [
      'Slot without a child',
      'import { Slot } from \'state-surface\';\nexport default () => <Slot name="a" />;',
      'needs exactly one component element',
    ],
    [
      'two Slot children',
      'import { Slot } from \'state-surface\';\nimport Title from \'../components/Title\';\nexport default () => <Slot name="a"><Title text="1" /><Title text="2" /></Slot>;',
      'needs exactly one component element',
    ],
    [
      'conditional Slot child',
      'import { Slot } from \'state-surface\';\nimport Title from \'../components/Title\';\nexport default (p: any) => <Slot name="a">{p.on && <Title text="1" />}</Slot>;',
      'needs exactly one component element',
    ],
    [
      'Slot child with JSX children',
      'import { Slot } from \'state-surface\';\nimport Title from \'../components/Title\';\nexport default () => <Slot name="a"><Title text="1"><b /></Title></Slot>;',
      'cannot have JSX children',
    ],
    [
      'Slot-in-Slot in one file',
      'import { Slot } from \'state-surface\';\nimport Title from \'../components/Title\';\nexport default () => <Slot name="a" fallback={<Slot name="b"><Title text="" /></Slot>}><Title text="" /></Slot>;',
      'cannot be nested inside another <Slot>',
    ],
    [
      'Slot child module renders a Slot',
      "import { Slot } from 'state-surface';\nimport Nested from '../components/Nested';\nexport default () => <Slot name=\"a\"><Nested /></Slot>;",
      'renders a <Slot>; Slots cannot be nested',
    ],
    [
      'computed island',
      'import Title from \'../components/Title\';\nconst C = Math.random() > 0.5 ? Title : Title;\nexport default () => <C text="" client:load />;',
      'must be a statically imported component',
    ],
    [
      'member expression island',
      'import * as UI from \'../components/Title\';\nexport default () => <UI.default text="" client:load />;',
      'statically imported component',
    ],
    [
      'directive on an HTML element',
      'export default () => <div client:load />;',
      'is an HTML element',
    ],
    [
      'two activation timings',
      'import Title from \'../components/Title\';\nexport default () => <Title text="" client:load client:idle />;',
      'only one activation timing',
    ],
    [
      'unknown directive',
      'import Title from \'../components/Title\';\nexport default () => <Title text="" client:sometimes />;',
      'unknown directive "client:sometimes"',
    ],
    [
      'invalid Slot name',
      'import { Slot } from \'state-surface\';\nimport Title from \'../components/Title\';\nexport default () => <Slot name="Bad_Name"><Title text="" /></Slot>;',
      'must match',
    ],
    [
      'reserved # in Slot name',
      'import { Slot } from \'state-surface\';\nimport Title from \'../components/Title\';\nexport default () => <Slot name="item#1"><Title text="" /></Slot>;',
      'reserved',
    ],
    [
      'dynamic Slot name',
      "import { Slot } from 'state-surface';\nimport Title from '../components/Title';\nexport default (p: any) => <Slot name={p.name}><Title text=\"\" /></Slot>;",
      '`name` must be a string literal',
    ],
    [
      'server mode with client directive',
      'import { Slot } from \'state-surface\';\nimport Title from \'../components/Title\';\nexport default () => <Slot name="a" mode="server" client:load><Title text="" /></Slot>;',
      'cannot be combined with client directives',
    ],
    [
      'server component outside a Slot',
      "import Cart from '../components/Cart';\nexport default () => <div><Cart /></div>;",
      'use it as the child of <Slot mode="server">',
    ],
    [
      'server component in a client Slot',
      "import { Slot } from 'state-surface';\nimport Cart from '../components/Cart';\nexport default () => <Slot name=\"cart\"><Cart /></Slot>;",
      'need mode="server"',
    ],
    [
      'server component as island',
      "import Cart from '../components/Cart';\nexport default () => <Cart client:load />;",
      'cannot be a client island',
    ],
    [
      '<Boot> inside a client island',
      "import Boots from '../components/Boots';\nexport default () => <Boots client:visible />;",
      'cannot contain <Boot>',
    ],
    [
      'island inside a client island',
      "import HasIsland from '../components/HasIsland';\nexport default () => <HasIsland client:load />;",
      'cannot contain islands',
    ],
    [
      'Slot inside island children',
      'import { Slot } from \'state-surface\';\nimport Title from \'../components/Title\';\nexport default () => <Title text="" client:load><Slot name="a"><Title text="" /></Slot></Title>;',
      'cannot be used inside island children',
    ],
  ];
  for (const [label, code, message] of cases)
    it(`reports ${label} with its location`, async () => {
      const failure = await transform(code).then(
        () => undefined,
        error => error as Error & { loc?: { line: number; column: number } }
      );
      expect(failure, label).toBeInstanceOf(Error);
      expect(failure!.message).toContain('[state-surface] /app/routes/index.tsx:');
      expect(failure!.message).toContain(message);
      expect(failure!.loc?.line).toBeGreaterThan(0);
    });

  it('allows islands and Boot inside server Slot children', async () => {
    const code =
      "import { Slot } from 'state-surface';\nimport HasIsland from '../components/HasIsland';\nimport Boots from '../components/Boots';\n" +
      'export default () => <main><Slot name="a" mode="server"><HasIsland /></Slot><Slot name="b" mode="server"><Boots /></Slot></main>;';
    expect((await transform(code))!.code).toContain('__ssId={"components/HasIsland.tsx#default"}');
  });
});

describe('plugin declarations', () => {
  const plugin = (options: string) =>
    analyzeModule(
      `import { definePlugin } from 'state-surface/client';\nexport const p = definePlugin(${options});`,
      '/app/client/p.ts'
    );

  it('reads literal load and slots of exported definePlugin() calls', () => {
    const facts = plugin("{ name: 'p', load: 'visible', slots: ['a', 'b'], attach() {} }");
    expect(facts.pluginDefinitions.get('p')).toEqual({ load: 'visible', slots: ['a', 'b'] });
    expect(plugin("{ name: 'p' }").pluginDefinitions.get('p')).toEqual({ load: 'idle' });
  });

  it('rejects non-literal plugin options and plugins exports', () => {
    expect(() => plugin("{ name: 'p', load: when }")).toThrow('`load` must be');
    expect(() => plugin("{ name: 'p', slots: names }")).toThrow('`slots` must be an array');
    expect(() => analyzeModule('export const plugins = list;', '/app/routes/a.tsx')).toThrow(
      'array literal'
    );
    expect(() =>
      analyzeModule('const local = {};\nexport const plugins = [local];', '/app/routes/a.tsx')
    ).toThrow('statically imported definePlugin() exports');
  });

  it('records the plugins a page declares', () => {
    const facts = analyzeModule(
      "import { scroll } from '../client/scroll';\nexport const plugins = [scroll];\nexport default () => <html />;",
      '/app/routes/a.tsx'
    );
    expect(facts.plugins.map(entry => [entry.local, entry.binding])).toEqual([
      ['scroll', { source: '../client/scroll', imported: 'scroll' }],
    ]);
  });
});

describe('app analysis', () => {
  it('collects client components reachable from demo pages', async () => {
    const real = new SurfaceAnalyzer(
      process.cwd(),
      path.resolve('engine'),
      async (source, importer) => {
        if (!source.startsWith('.')) return undefined;
        const base = path.resolve(path.dirname(importer), source.replace(/\.js$/, ''));
        for (const candidate of [`${base}.tsx`, `${base}.ts`]) {
          try {
            await import('node:fs/promises').then(fs => fs.access(candidate));
            return candidate;
          } catch {
            /* try next */
          }
        }
        return undefined;
      }
    );
    const app = await real.app();
    expect(app.pages).toHaveLength(9);
    const pluginsOf = (page: string) =>
      app.pagePlugins.get(path.resolve('routes', page))?.map(plugin => [plugin.id, plugin.load]);
    expect(pluginsOf('guide/[slug].tsx')).toEqual([
      ['client/plugins/prism.ts#prism', 'load'],
      ['client/plugins/guideToc.ts#guideToc', 'idle'],
    ]);
    expect(pluginsOf('examples/chat.tsx')).toEqual([
      ['client/plugins/chatScroll.ts#chatScroll', 'load'],
    ]);
    expect(pluginsOf('index.tsx')).toEqual([]);
    expect(app.plugins.size).toBe(3);
    expect([...app.client.keys()]).toContain('routes/_shared/components/pageHeader.tsx#default');
    expect([...app.client.keys()]).toContain(
      'routes/examples/chat/_components/chatTyping.tsx#default'
    );
    expect(app.client.size).toBe(23);
  });

  it('reports one slot name declared by two modules on the same page', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'surface-app-'));
    try {
      await mkdir(path.join(dir, 'routes'), { recursive: true });
      await mkdir(path.join(dir, 'layouts'), { recursive: true });
      await writeFile(path.join(dir, 'Title.tsx'), 'export default () => <h1 />;');
      await writeFile(
        path.join(dir, 'layouts/Layout.tsx'),
        "import { Slot } from 'state-surface';\nimport Title from '../Title.tsx';\nexport default (_: any, c: any) => <html><head /><body><Slot name=\"x\"><Title /></Slot>{c}</body></html>;"
      );
      await writeFile(
        path.join(dir, 'routes/index.tsx'),
        "import { Slot } from 'state-surface';\nimport Layout from '../layouts/Layout.tsx';\nimport Title from '../Title.tsx';\nexport default () => <Layout><Slot name=\"x\"><Title /></Slot></Layout>;"
      );
      const resolve = async (source: string, importer: string) =>
        source.startsWith('.') ? path.resolve(path.dirname(importer), source) : undefined;
      await expect(new SurfaceAnalyzer(dir, '/engine', resolve).app()).rejects.toThrow(
        /Slot name "x" is declared in both (routes\/index|layouts\/Layout)\.tsx and/
      );
      await writeFile(path.join(dir, 'routes/about.tsx'), 'export const prerender = true;');
      await writeFile(path.join(dir, 'routes/index.tsx'), 'export default () => <html />;');
      await expect(new SurfaceAnalyzer(dir, '/engine', resolve).app()).rejects.toThrow(
        'Pages must default-export a page function'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
