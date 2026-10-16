// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { h } from 'lithent';
import { renderToString } from 'lithent/ssr';
import { renderPage } from './ssrRenderer.js';
import { defineServerComponent } from './serverComponent.js';
import { createContext, type SurfaceContext } from './core/context.js';
import { Boot, Island, Slot } from '../shared/surfaceTree.js';
import type { PageModule } from '../shared/routeModule.js';

// The build plugin compiles `<Slot name="x"><C {...p} /></Slot>` and `<C client:idle />` into
// the descriptor form used below; these tests exercise the runtime half of that contract.
const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  h(tag as never, props as never, ...(children as never[]));
const island = (component: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  el(
    Island,
    { __ssComponent: component, __ssId: `${(component as Function).name}.tsx#default`, ...props },
    ...children
  );
// Client slot unless the test sets a mode or a directive (no directive normalizes to static).
const slot = (props: Record<string, unknown>, child?: unknown) => {
  const client =
    props.mode === undefined && !Object.keys(props).some(key => key.startsWith('client:'));
  const input = client ? { ...props, 'client:load': true } : props;
  return child === undefined ? el(Slot, input) : el(Slot, input, child);
};
const documentOf = (...body: unknown[]) =>
  el('html', { lang: 'en' }, el('head', {}, el('title', {}, 'Test')), el('body', {}, ...body));
const page = (render: PageModule['default']): PageModule => ({ default: render });

function context(url = 'https://surface.test/'): SurfaceContext {
  return createContext(new Request(url), { basePath: '', signal: new AbortController().signal })
    .ctx;
}

function json(html: string, id: string) {
  const match = html.match(new RegExp(`<script id="${id}" type="application/json">(.*?)</script>`));
  return match ? JSON.parse(match[1]) : undefined;
}
/** Slot and island entries of `__SURFACE__` keyed by id. */
function slotsOf(html: string): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    (json(html, '__SURFACE__')?.slots ?? []).map((entry: { id: string }) => [entry.id, entry])
  );
}
/** Client SSR snapshot props per slot (what `__STATE__` used to hold). */
function propsOf(html: string) {
  return Object.fromEntries(
    Object.entries(slotsOf(html))
      .filter(([, entry]) => entry.props !== undefined && !String(entry.id).includes('$'))
      .map(([id, entry]) => [id, entry.props])
  );
}

const Title = ({ text }: { text: string }) => el('h1', {}, text);
const Counter = ({ count }: { count: number }) => el('button', { type: 'button' }, String(count));

describe('Lithent SSR attribute contract', () => {
  it('serializes JSON data attributes with escaped quotes', () => {
    const params = { mode: 'full' };
    const html = renderToString(h('button', { 'data-params': JSON.stringify(params) }));
    expect(html).toContain('data-params="{&quot;mode&quot;:&quot;full&quot;');
    const root = document.createElement('div');
    root.innerHTML = html;
    expect(JSON.parse(root.firstElementChild!.getAttribute('data-params')!)).toEqual(params);
  });

  it('keeps quote and markup payloads inside a single title attribute', () => {
    const title = 'a"b<c>d&e\' onmouseover="alert(1)"><script>alert(1)</script>';
    const html = renderToString(h('div', { title }));
    // Full parser round-trip runs in Chromium: happy-dom 20 retains &lt;/&gt;
    // in attribute values, unlike browser HTML parsers.
    expect(html).toBe(
      '<div title="a&quot;b&lt;c&gt;d&amp;e\' onmouseover=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"></div>'
    );
  });

  it('preserves boolean, style and trusted innerHTML behavior', () => {
    const html = renderToString(
      h('button', {
        disabled: true,
        hidden: false,
        style: { color: 'red', fontFamily: '"Fira Code", monospace' },
        innerHTML: '<strong>trusted</strong>',
      })
    );
    const root = document.createElement('div');
    root.innerHTML = html;
    const button = root.firstElementChild as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute('hidden')).toBe(false);
    expect(button.style.color).toBe('red');
    expect(button.style.fontFamily).toContain('Fira Code');
    expect(button.innerHTML).toBe('<strong>trusted</strong>');
  });

  it('round-trips JSON slot props through data-params and __SURFACE__', async () => {
    const Action = ({ params }: { params: Record<string, string> }) =>
      el('button', { 'data-action': 'go', 'data-params': JSON.stringify(params) }, 'Go');
    const render = (params: Record<string, string>) =>
      renderPage(
        page(() => documentOf(slot({ name: 'act' }, island(Action, { params })))),
        context()
      );

    // Markup payloads stay inside the attribute and the JSON script.
    const hostile = { q: '"><script>alert(1)</script>' };
    const hostileHtml = await render(hostile);
    expect(hostileHtml).not.toContain('<script>alert(1)');
    expect(propsOf(hostileHtml)).toEqual({ act: { params: hostile } });

    // DOM parser round-trip (happy-dom decodes &quot;/&amp; but not &lt;/&gt; in attributes;
    // the markup round-trip is covered in Chromium by the browser spikes).
    const params = { q: '"quoted" value', amp: 'a&b' };
    const html = await render(params);
    const root = document.createElement('div');
    root.innerHTML = html.slice(html.indexOf('<h-state'), html.indexOf('</h-state>') + 10);
    expect(JSON.parse(root.querySelector('button')!.getAttribute('data-params')!)).toEqual(params);
  });
});

describe('document assembly', () => {
  it('writes doctype, comment markers and engine tags in order with the request nonce', async () => {
    const ctx = context();
    const html = await renderPage(
      page(() => documentOf(slot({ name: 'title' }, island(Title, { text: 'Hello' })))),
      ctx,
      {
        plugins: [{ id: 'p.ts#scroll', load: 'idle' }],
        buildId: 'b1',
        pageId: 'index',
        tags: () => ({
          styles: ['/assets/app.css'],
          preload: ['/assets/title.js'],
          appEntry: '/assets/app.js',
          engineEntry: '/assets/loader.js',
        }),
      }
    );
    expect(html).toBe(
      '<!doctype html><html lang="en"><head><!--ss:head--><title>Test</title>' +
        '<link rel="stylesheet" href="/assets/app.css">' +
        '<link rel="modulepreload" href="/assets/title.js">' +
        '<script id="__SURFACE__" type="application/json">{"buildId":"b1","pageId":"index","basePath":"",' +
        '"slots":[{"id":"title","mode":"client","component":"Title.tsx#default","props":{"text":"Hello"}}],' +
        '"plugins":[{"id":"p.ts#scroll","load":"idle"}]}</script>' +
        `<script type="module" src="/assets/app.js" nonce="${ctx.nonce}"></script>` +
        `<script type="module" src="/assets/loader.js" nonce="${ctx.nonce}"></script>` +
        '<!--/ss:head--></head><body><!--ss:body-->' +
        '<h-state name="title"><h1>Hello</h1></h-state>' +
        '<!--/ss:body--></body></html>'
    );
  });

  it('keeps user text that looks like a placeholder or marker untouched', async () => {
    const text = '<surface-mark data-t="x:head-end"></surface-mark><!--ss:body-->';
    const html = await renderPage(
      page(() => documentOf(el('p', {}, text))),
      context()
    );
    expect(html).toContain(
      '&lt;surface-mark data-t="x:head-end"&gt;&lt;/surface-mark&gt;&lt;!--ss:body--&gt;'
    );
    expect(html.match(/<!--ss:body-->/g)).toHaveLength(1);
  });

  it('rejects layouts without exactly one html, head and body', async () => {
    await expect(
      renderPage(
        page(() => el('main', {})),
        context()
      )
    ).rejects.toThrow('exactly one <html>, <head> and <body> (found 0, 0, 0)');
    await expect(
      renderPage(
        page(() => documentOf(el('body', {}))),
        context()
      )
    ).rejects.toThrow('(found 1, 1, 2)');
    await expect(
      renderPage(
        page(() => 'text' as never),
        context()
      )
    ).rejects.toThrow('must return JSX');
  });
});

describe('async components', () => {
  it('diagnoses a component that returns a Promise instead of rendering nothing', async () => {
    const AsyncWidget = async () => el('p', {}, 'late');
    await expect(
      renderPage(
        page(() => documentOf(el('main', {}, el(AsyncWidget)))),
        context()
      )
    ).rejects.toThrow('<AsyncWidget> returned a Promise');
  });
});

describe('entry selection', () => {
  const tags = vi.fn(() => ({
    styles: ['/app.css'],
    preload: [],
    appEntry: '/app.js',
    engineEntry: '/loader.js',
  }));
  const usageOf = async (...body: unknown[]) => {
    tags.mockClear();
    const html = await renderPage(
      page(() => documentOf(...body)),
      context(),
      { tags }
    );
    return { html, usage: (tags.mock.calls[0] as unknown[])[0] as Record<string, unknown> };
  };

  it('writes no engine script or bootstrap JSON for a static page (V-01)', async () => {
    const { html, usage } = await usageOf(
      el(Slot, { name: 'hero' }, island(Title, { text: 'static' })),
      el('a', { href: '/x' }, 'link')
    );
    expect(usage).toMatchObject({ engine: false, actions: false, components: [] });
    expect(html).toContain('<h-state name="hero"><h1>static</h1></h-state>');
    expect(html).not.toContain('"slots"');
    expect(html).not.toContain('/loader.js');
    // The app entry still runs on every page (DC-18), with the build, page and base path.
    expect(json(html, '__SURFACE__')).toEqual({ buildId: 'dev', pageId: '', basePath: '' });
    expect(html).toContain('src="/app.js"');
  });

  it('starts the engine for actions and <Boot> without client components', async () => {
    const { html, usage } = await usageOf(el('button', { 'data-action': 'like' }, 'Like'));
    expect(usage).toMatchObject({ engine: true, actions: true, components: [] });
    expect(html).toContain('src="/loader.js"');
    expect((await usageOf(el(Boot, { transition: 'go' }))).usage).toMatchObject({ actions: true });
  });

  it('lists rendered client components once and preloads only client:load ones', async () => {
    const { usage } = await usageOf(
      island(Counter, { count: 1, 'client:idle': true }),
      island(Counter, { count: 2, 'client:load': true }),
      island(Title, { text: 'x', 'client:visible': true }),
      false && island(Counter, { count: 3, 'client:load': true })
    );
    expect(usage.components).toEqual([
      { componentId: 'Counter.tsx#default', preload: true },
      { componentId: 'Title.tsx#default', preload: false },
    ]);
    expect(usage.actions).toBe(false);
  });

  it('writes activation metadata and skips SSR for client:only slots', async () => {
    const Heavy = vi.fn(() => el('canvas', {}));
    const html = await renderPage(
      page(() =>
        documentOf(
          el(
            Slot,
            {
              name: 'chart',
              'client:only': true,
              'client:media': '(min-width: 800px)',
              fallback: el('p', {}, 'Loading'),
            },
            island(Heavy, { points: [1, 2] })
          )
        )
      ),
      context()
    );
    expect(Heavy).not.toHaveBeenCalled();
    expect(html).toContain('<h-state name="chart"><p>Loading</p></h-state>');
    expect(slotsOf(html).chart).toEqual({
      id: 'chart',
      mode: 'client',
      component: 'Mock.tsx#default',
      activation: 'media',
      media: '(min-width: 800px)',
      only: true,
      props: { points: [1, 2] },
    });
  });
});

describe('slots', () => {
  it('renders client slots with their props as state, empty slots without state', async () => {
    const html = await renderPage(
      page(() =>
        documentOf(
          slot(
            { name: 'count', class: 'card', 'data-animate': 'fade' },
            island(Counter, { count: 3 })
          ),
          slot({ name: 'later', component: Title, __ssComponentId: 'Title.tsx#default' })
        )
      ),
      context()
    );
    expect(html).toContain(
      '<h-state name="count" class="card" data-animate="fade"><button type="button">3</button></h-state>'
    );
    expect(html).toContain('<h-state name="later"></h-state>');
    expect(propsOf(html)).toEqual({ count: { count: 3 } });
    expect(slotsOf(html).later).toEqual({
      id: 'later',
      mode: 'client',
      component: 'Title.tsx#default',
    });
  });

  it('writes resetKey for client slots and islands and rejects it on server slots (DC-05)', async () => {
    const html = await renderPage(
      page(() =>
        documentOf(
          slot({ name: 'editor', resetKey: 'id' }, island(Title, { text: 'a', id: 1 })),
          island(Counter, { count: 1, id: 'c', resetKey: ['id'], 'client:idle': true })
        )
      ),
      context()
    );
    const entries = slotsOf(html);
    expect(entries.editor.resetKey).toEqual(['id']);
    expect(entries.$0).toMatchObject({ resetKey: ['id'], props: { count: 1, id: 'c' } });
    await expect(
      renderPage(
        page(() =>
          documentOf(
            slot({ name: 'x', mode: 'server', resetKey: 'id' }, island(Title, { text: '' }))
          )
        ),
        context()
      )
    ).rejects.toThrow('resetKey needs a client slot');
  });

  it('sends transition metadata only on engine pages', async () => {
    const actions = { search: { targets: ['list'] } };
    const engine = await renderPage(
      page(() => documentOf(el('button', { 'data-action': 'search' }, 'go'))),
      context(),
      { actions }
    );
    expect(json(engine, '__SURFACE__').actions).toEqual(actions);
    const plain = await renderPage(
      page(() => documentOf(el('p', {}, 'x'))),
      context(),
      {
        actions,
      }
    );
    expect(json(plain, '__SURFACE__')).toBeUndefined();
  });

  it('awaits server loads in parallel and renders their data without client state', async () => {
    const started: string[] = [];
    const finish: Array<() => void> = [];
    const Price = defineServerComponent({
      load: ({ id }: { id: string }, ctx) =>
        new Promise<{ id: string; path: string }>(resolve => {
          started.push(id);
          finish.push(() => resolve({ id, path: ctx.url.pathname }));
        }),
      render: ({ id, path }) => el('span', {}, `${id}@${path}`),
    });
    const rendering = renderPage(
      page(() =>
        documentOf(
          slot({ name: 'a', mode: 'server' }, island(Price, { id: 'A' })),
          slot({ name: 'b', mode: 'server' }, island(Price, { id: 'B' }))
        )
      ),
      context('https://surface.test/prices')
    );
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    expect(started).toEqual(['A', 'B']);
    finish.reverse().forEach(resolve => resolve());
    const html = await rendering;
    expect(html).toContain('<h-state name="a"><span>A@/prices</span></h-state>');
    expect(html).toContain('<h-state name="b"><span>B@/prices</span></h-state>');
    // Server slots need no browser code; their input never reaches the page.
    expect(json(html, '__SURFACE__')).toBeUndefined();
    expect(html).not.toContain('"id":"A"');
  });

  it('fails the page when a server load rejects or throws synchronously', async () => {
    const Rejects = defineServerComponent({
      load: async () => Promise.reject(new Error('load failed')),
      render: () => el('p', {}),
    });
    const Throws = defineServerComponent({
      load: () => {
        throw new Error('sync failure');
      },
      render: () => el('p', {}),
    });
    for (const [component, message] of [
      [Rejects, 'load failed'],
      [Throws, 'sync failure'],
    ] as const)
      await expect(
        renderPage(
          page(() => documentOf(slot({ name: 'x', mode: 'server' }, island(component)))),
          context()
        )
      ).rejects.toThrow(message);
  });

  it('rejects server components outside server slots and direct calls', async () => {
    const Cart = defineServerComponent({ load: () => ({}), render: () => el('p', {}) });
    await expect(
      renderPage(
        page(() => documentOf(slot({ name: 'cart' }, island(Cart)))),
        context()
      )
    ).rejects.toThrow('need mode="server"');
    await expect(
      renderPage(
        page(() => documentOf(island(Cart, { 'client:load': true }))),
        context()
      )
    ).rejects.toThrow('cannot be a client island');
    expect(() => el(Cart, {})).toThrow('child of <Slot mode="server">');
  });

  it('diagnoses duplicate, malformed and nested slots', async () => {
    const twice = page(() =>
      documentOf(
        slot({ name: 'dup' }, island(Title, { text: '' })),
        slot({ name: 'dup' }, island(Title, { text: '' }))
      )
    );
    await expect(renderPage(twice, context())).rejects.toThrow('"dup" is used more than once');
    expect(() => slot({ name: 'Bad Name' }, island(Title))).toThrow('must match');
    expect(() => slot({ name: 'comment#1' }, island(Title))).toThrow('reserved');
    const Inner = () => slot({ name: 'inner' }, island(Title, { text: '' }));
    await expect(
      renderPage(
        page(() => documentOf(slot({ name: 'outer', mode: 'server' }, island(Inner)))),
        context()
      )
    ).rejects.toThrow('<Slot name="inner"> cannot be used inside another <Slot>');
  });

  it('validates the single child and engine attributes', () => {
    expect(() => slot({ name: 'x' })).toThrow('exactly one');
    expect(() => el(Slot, { name: 'x' }, island(Title), island(Title))).toThrow('exactly one');
    expect(() => slot({ name: 'x' }, el(Title, { text: 'computed' }))).toThrow('exactly one');
    expect(() => slot({ name: 'x', onclick: 'x' }, island(Title))).toThrow('unknown attribute');
    expect(() => slot({ name: 'x', mode: 'server', 'client:load': true }, island(Title))).toThrow(
      'cannot be combined'
    );
    expect(() => slot({ name: 'x' }, island(Title, { 'client:idle': true }))).toThrow(
      'put directives on the <Slot>'
    );
    expect(() =>
      slot({ name: 'x', 'client:idle': true, 'client:load': true }, island(Title))
    ).toThrow('only one activation timing');
  });
});

describe('islands', () => {
  it('serializes public props and server-renders children as a static fragment (IC-03)', async () => {
    const Card = ({ title }: { title: string }, children: unknown) =>
      el('section', {}, el('h2', {}, title), children);
    const html = await renderPage(
      page(() =>
        documentOf(
          island(Card, { title: 'Card', 'client:idle': true }, el('p', {}, 'server child'))
        )
      ),
      context()
    );
    expect(html).toContain(
      '<h-island data-island="$0" style="display:contents">' +
        '<section><h2>Card</h2><h-children style="display:contents"><p>server child</p></h-children></section></h-island>'
    );
    expect(slotsOf(html).$0).toEqual({
      id: '$0',
      mode: 'client',
      component: 'Card.tsx#default',
      props: { title: 'Card' },
      activation: 'idle',
    });
    expect(html).not.toContain('<template');
  });

  it('never calls client:only components on the server and transports children', async () => {
    const OnlyClient = vi.fn(() => el('canvas', {}));
    const html = await renderPage(
      page(() =>
        documentOf(
          island(
            OnlyClient,
            { 'client:only': true, fallback: el('p', {}, 'Loading') },
            el('b', {}, 'kid')
          )
        )
      ),
      context()
    );
    expect(OnlyClient).not.toHaveBeenCalled();
    expect(slotsOf(html).$0).toMatchObject({ only: true });
    expect(html).toContain(
      '<template data-surface-children=""><b>kid</b></template><p>Loading</p>'
    );
  });

  it('keeps the children transport when the component does not render children', async () => {
    const Ignores = () => el('div', {}, 'no children');
    const html = await renderPage(
      page(() => documentOf(island(Ignores, { 'client:load': true }, el('i', {}, 'kept')))),
      context()
    );
    expect(html).toContain(
      '<template data-surface-children=""><i>kept</i></template><div>no children</div>'
    );
  });

  it('diagnoses props that JSON would drop or change (IC-04)', async () => {
    const cases: Array<[unknown, string]> = [
      [new Date(0), 'props.value is a Date'],
      [() => {}, 'props.value is a function'],
      [1n, 'props.value is a BigInt'],
      [Number.NaN, 'props.value is NaN'],
      [[undefined], 'props.value[0] is undefined'],
      [new Map(), 'props.value is a Map'],
    ];
    for (const [value, message] of cases)
      await expect(
        renderPage(
          page(() => documentOf(island(Counter, { value, 'client:load': true }))),
          context()
        )
      ).rejects.toThrow(message);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    await expect(
      renderPage(
        page(() => documentOf(slot({ name: 'c' }, island(Counter, { cycle })))),
        context()
      )
    ).rejects.toThrow('circular');
    // Optional props that are undefined are omitted on both sides.
    const html = await renderPage(
      page(() => documentOf(slot({ name: 'ok' }, island(Counter, { count: 1, extra: undefined })))),
      context()
    );
    expect(propsOf(html)).toEqual({ ok: { count: 1 } });
  });

  it('rejects islands inside client components and slots inside island children', async () => {
    const Wrapper = () => el('div', {}, island(Counter, { count: 1, 'client:load': true }));
    await expect(
      renderPage(
        page(() => documentOf(slot({ name: 'w' }, island(Wrapper)))),
        context()
      )
    ).rejects.toThrow('cannot be used inside a client component');
    await expect(
      renderPage(
        page(() =>
          documentOf(island(Counter, { 'client:load': true }, slot({ name: 'kid' }, island(Title))))
        ),
        context()
      )
    ).rejects.toThrow('inside fallback or island children');
  });

  it('allows islands inside server slots', async () => {
    const Panel = () => el('div', {}, island(Counter, { count: 7, 'client:visible': true }));
    const html = await renderPage(
      page(() => documentOf(slot({ name: 'panel', mode: 'server' }, island(Panel)))),
      context()
    );
    // Islands inside a slot get slot-scoped ids, the same ones html ops produce.
    expect(html).toContain('<h-state name="panel"><div><h-island data-island="panel$0"');
    expect(html).toContain('<button type="button">7</button>');
    expect(slotsOf(html)['panel$0']).toMatchObject({ activation: 'visible', props: { count: 7 } });
  });
});

describe('<Boot>', () => {
  it('records rendered boots in document order, including server slot content', async () => {
    const Panel = () => el('div', {}, el(Boot, { transition: 'second', params: { n: 2 } }));
    const html = await renderPage(
      page(() =>
        documentOf(
          el(Boot, { transition: 'first' }),
          slot({ name: 'panel', mode: 'server' }, island(Panel)),
          false && el(Boot, { transition: 'skipped' }),
          el(Boot, { transition: 'third', params: { q: '</script>' } })
        )
      ),
      context()
    );
    expect(json(html, '__SURFACE__').boot).toEqual([
      { transition: 'first', params: {} },
      { transition: 'second', params: { n: 2 } },
      { transition: 'third', params: { q: '</script>' } },
    ]);
  });

  it('rejects <Boot> rendered by a client component', async () => {
    const Client = () => el('div', {}, el(Boot, { transition: 'nope' }));
    await expect(
      renderPage(
        page(() => documentOf(slot({ name: 'c' }, island(Client)))),
        context()
      )
    ).rejects.toThrow('<Boot transition="nope"> cannot be used inside a client component');
    expect(() => el(Boot, {})).toThrow('requires a `transition`');
  });
});

describe('request isolation', () => {
  it('keeps slots, props and boot of interleaved requests separate', async () => {
    const pageModule = page(async ctx => {
      const id = ctx.url.searchParams.get('id')!;
      const header = slot({ name: 'header' }, island(Title, { text: `header-${id}` }));
      await new Promise(resolve => setTimeout(resolve, id === 'slow' ? 15 : 0));
      return documentOf(header, el(Boot, { transition: `boot-${id}` }));
    });
    const [slow, fast] = await Promise.all(
      ['slow', 'fast'].map(id => renderPage(pageModule, context(`https://surface.test/?id=${id}`)))
    );
    expect(propsOf(slow)).toEqual({ header: { text: 'header-slow' } });
    expect(propsOf(fast)).toEqual({ header: { text: 'header-fast' } });
    expect(json(slow, '__SURFACE__').boot).toEqual([{ transition: 'boot-slow', params: {} }]);
    expect(json(fast, '__SURFACE__').boot).toEqual([{ transition: 'boot-fast', params: {} }]);
  });

  it('does not mutate module-level JSX shared between requests', async () => {
    const shared = slot({ name: 'shared' }, island(Title, { text: 'same' }));
    const pageModule = page(() => documentOf(shared));
    const first = await renderPage(pageModule, context());
    const second = await renderPage(pageModule, context());
    expect(second.replace(/nonce="[^"]+"/, '')).toBe(first.replace(/nonce="[^"]+"/, ''));
    expect(first).toContain('<h1>same</h1>');
  });
});
