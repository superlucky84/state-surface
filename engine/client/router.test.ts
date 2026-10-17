/**
 * @vitest-environment happy-dom
 * @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"disableJavaScriptFileLoading":true,"disableIframePageLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { persistPlan, startRouter, type NavigationDetail } from './router.js';
import type { PageController } from './start.js';
import type { SurfaceBootstrap } from '../shared/protocol.js';
import { setBasePath } from '../shared/basePath.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 20));
const bootstrapJson = (value: Partial<SurfaceBootstrap>) =>
  `<script id="__SURFACE__" type="application/json">${JSON.stringify({
    buildId: 'b1',
    pageId: 'page',
    basePath: '',
    router: {},
    ...value,
  })}</script>`;

/** A document laid out like SSR output: managed regions between comment markers. */
function page(options: {
  title: string;
  head?: string;
  body: string;
  bootstrap?: Partial<SurfaceBootstrap>;
}) {
  return (
    `<!doctype html><html><head><!--ss:head--><title data-ss>${options.title}</title>` +
    (options.head ?? '').replace(/<(link|script)/g, '<$1 data-ss') +
    bootstrapJson(options.bootstrap ?? {}) +
    '<script type="module" src="/assets/loader.js" data-ss></script><!--/ss:head--></head>' +
    `<body><!--ss:body-->${options.body}<!--/ss:body--></body></html>`
  );
}

const PAGES: Record<string, string> = {
  '/b': page({
    title: 'B',
    head: '<link rel="stylesheet" href="/assets/shared.css"><link rel="stylesheet" href="/assets/b.css"><script type="module" src="/assets/b.js"></script>',
    body:
      '<main><h1>Page B</h1><a href="/a">A</a><iframe data-surface-persist="map"></iframe>' +
      '<script>window.inert = 1</script><script data-surface-rerun>window.rerun = 1</script></main>',
  }),
  '/a': page({
    title: 'A',
    head: '<link rel="stylesheet" href="/assets/shared.css">',
    body: '<main><h1>Page A</h1><a href="/b">B</a></main>',
  }),
};

function setup(
  options: {
    router?: SurfaceBootstrap['router'];
    pages?: Record<string, string>;
    nonce?: string;
  } = {}
) {
  const pages = { ...PAGES, ...options.pages };
  document.documentElement.innerHTML =
    '<head><!--ss:head--><title data-ss>A</title><link rel="stylesheet" href="/assets/shared.css" data-ss>' +
    '<link rel="stylesheet" href="/assets/a-only.css" data-ss>' +
    // A tag manager inserted this while the head was parsed: inside the markers, not owned.
    '<script src="/gtm.js" async></script>' +
    bootstrapJson({ router: options.router ?? {} }) +
    `<script type="module" src="/assets/loader.js" data-ss${options.nonce ? ` nonce="${options.nonce}"` : ''}></script><!--/ss:head-->` +
    '<meta name="third-party" content="kept"></head>' +
    '<body><!--ss:body--><main><h1>Page A</h1><a id="to-b" href="/b">B</a>' +
    '<iframe data-surface-persist="map"></iframe><input id="field" value="hello"></main>' +
    '<!--/ss:body--><div id="gtm">third party</div></body>';
  const fetches: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    fetches.push({ url, init });
    const path = new URL(url).pathname + new URL(url).search;
    const body = pages[path] ?? pages[new URL(url).pathname];
    if (body === undefined) return new Response('missing', { status: 404 });
    if (body.startsWith('JSON:')) return Response.json({ ok: true });
    const status = body.startsWith('404:') ? 404 : 200;
    return new Response(body.replace(/^404:/, ''), {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const assign = vi.fn();
  vi.spyOn(location, 'assign').mockImplementation(assign);
  const calls: string[] = [];
  let bootstrap: SurfaceBootstrap = {
    buildId: 'b1',
    pageId: 'page',
    basePath: '',
    router: options.router ?? {},
  };
  let actionEnd = () => {};
  const controller: PageController = {
    get bootstrap() {
      return bootstrap;
    },
    navigationStart: () => calls.push('navigationStart'),
    leavePage: () => calls.push('leavePage'),
    enterPage(next) {
      bootstrap = next;
      calls.push('enterPage');
    },
    onActionEnd(listener) {
      actionEnd = listener;
    },
  };
  const events: Array<[string, NavigationDetail]> = [];
  for (const type of [
    'surface:before-preparation',
    'surface:after-preparation',
    'surface:before-swap',
    'surface:after-swap',
    'surface:page-load',
  ])
    document.addEventListener(type, event =>
      events.push([type, (event as CustomEvent<NavigationDetail>).detail])
    );
  const router = startRouter(controller);
  stop = router.stop;
  const click = (el: Element, init: MouseEventInit = {}) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    el.dispatchEvent(event);
    return event;
  };
  return { router, fetches, assign, calls, events, click, actionEnd: () => actionEnd() };
}

let stop = () => {};
beforeEach(() => {
  history.replaceState(null, '', '/a');
  setBasePath('');
});
afterEach(() => {
  stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('client router navigation (DC-18, DESIGN 10.1)', () => {
  it('swaps only the marker regions and runs the event pipeline in order', async () => {
    const { click, events, calls, fetches } = setup();
    const persisted = document.querySelector('iframe')!;
    const sharedCss = document.querySelector('link[href="/assets/shared.css"]');
    const event = click(document.getElementById('to-b')!);
    expect(event.defaultPrevented).toBe(true);
    await flush();
    expect(fetches[0].url).toBe('http://localhost:3000/b');
    expect(fetches[0].init.headers).toMatchObject({ Accept: 'text/html' });
    expect(location.pathname).toBe('/b');
    expect(document.title).toBe('B');
    expect(document.querySelector('h1')!.textContent).toBe('Page B');
    expect(events.map(([type]) => type)).toEqual([
      'surface:page-load',
      'surface:before-preparation',
      'surface:after-preparation',
      'surface:before-swap',
      'surface:after-swap',
      'surface:page-load',
    ]);
    expect(events[1][1]).toMatchObject({ direction: 'forward', trigger: 'link' });
    expect(calls).toEqual(['navigationStart', 'leavePage', 'enterPage']);
    // Third-party nodes outside the markers, and unmarked ones inside, stay (DESIGN 8.2).
    expect(document.querySelector('meta[name="third-party"]')).not.toBeNull();
    expect(document.querySelector('script[src="/gtm.js"]')).not.toBeNull();
    expect(document.getElementById('gtm')!.textContent).toBe('third party');
    // Stylesheets are kept or added by URL; page-only ones leave.
    expect(document.querySelector('link[href="/assets/shared.css"]')).toBe(sharedCss);
    expect(document.querySelector('link[href="/assets/b.css"]')).not.toBeNull();
    expect(document.querySelector('link[href="/assets/a-only.css"]')).toBeNull();
    // The loader script is not inserted again; the new page's module script is, once.
    expect(document.querySelectorAll('script[src="/assets/loader.js"]')).toHaveLength(1);
    expect(document.querySelectorAll('script[src="/assets/b.js"]')).toHaveLength(1);
    // Persisted element: the same node, its placeholder removed (DC-19).
    expect(document.querySelector('iframe')).toBe(persisted);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    // Focus moves to <main>; the new title is announced.
    expect(document.activeElement).toBe(document.querySelector('main'));
    expect(document.body.lastElementChild!.textContent).toBe('B');
  });

  it('re-creates only data-surface-rerun inline scripts with the document nonce', async () => {
    const { click } = setup({ nonce: 'n1' });
    click(document.getElementById('to-b')!);
    await flush();
    const scripts = Array.from(document.body.querySelectorAll('script'));
    const inert = scripts.find(script => script.textContent!.includes('inert'))!;
    const rerun = scripts.find(script => script.textContent!.includes('rerun'))!;
    expect(inert.hasAttribute('nonce')).toBe(false);
    expect(rerun.getAttribute('nonce')).toBe('n1');
    expect(document.head.querySelector('script[src="/assets/b.js"]')!.getAttribute('nonce')).toBe(
      'n1'
    );
  });

  it('leaves modified clicks, targets, downloads, hashes, opt-outs, actions and other origins to the browser', async () => {
    const { click, fetches } = setup();
    const main = document.querySelector('main')!;
    main.insertAdjacentHTML(
      'beforeend',
      '<a id="blank" href="/b" target="_blank">x</a><a id="download" href="/b" download>x</a>' +
        '<a id="hash" href="/a#top">x</a><a id="reload" href="/b" data-surface-reload>x</a>' +
        '<a id="action" href="/b" data-action="go">x</a><a id="external" href="https://elsewhere.test/b">x</a>'
    );
    // Record the router's decision, then stop happy-dom from following the link itself.
    const decided: Array<[string, boolean]> = [];
    const record = (event: Event) => {
      decided.push([(event.target as Element).id, event.defaultPrevented]);
      event.preventDefault();
    };
    document.addEventListener('click', record);
    for (const id of ['blank', 'download', 'hash', 'reload', 'action', 'external'])
      click(document.getElementById(id)!);
    click(document.getElementById('to-b')!, { metaKey: true });
    click(document.getElementById('to-b')!, { ctrlKey: true });
    document.removeEventListener('click', record);
    expect(decided).toEqual([
      ['blank', false],
      ['download', false],
      ['hash', false],
      ['reload', false],
      ['action', false],
      ['external', false],
      ['to-b', false],
      ['to-b', false],
    ]);
    await flush();
    expect(fetches).toHaveLength(0);
  });

  it('turns GET forms into navigations with their query and leaves POST forms alone', async () => {
    const { fetches } = setup({
      pages: { '/search': page({ title: 'Search', body: '<main>results</main>' }) },
    });
    document
      .querySelector('main')!
      .insertAdjacentHTML(
        'beforeend',
        '<form id="get" action="/search"><input name="q" value="lithent"><button id="go" name="sort" value="new">Go</button></form>' +
          '<form id="post" method="post" action="/search"><input name="q" value="x"></form>'
      );
    const submit = (form: Element, submitter?: HTMLElement) => {
      const event = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter });
      form.dispatchEvent(event);
      return event;
    };
    expect(
      submit(document.getElementById('get')!, document.getElementById('go')!).defaultPrevented
    ).toBe(true);
    expect(submit(document.getElementById('post')!).defaultPrevented).toBe(false);
    await flush();
    expect(fetches.map(fetch => fetch.url)).toEqual([
      'http://localhost:3000/search?q=lithent&sort=new',
    ]);
    expect(location.search).toBe('?q=lithent&sort=new');
  });

  it('cancels from surface:before-preparation', async () => {
    const { click, fetches } = setup();
    document.addEventListener('surface:before-preparation', event => event.preventDefault(), {
      once: true,
    });
    click(document.getElementById('to-b')!);
    await flush();
    expect(fetches).toHaveLength(0);
    expect(location.pathname).toBe('/a');
  });

  it.each([
    ['a non-HTML response', 'JSON:'],
    [
      'a page without the router',
      page({ title: 'X', body: '<main/>', bootstrap: { router: undefined } }),
    ],
    ['another build', page({ title: 'X', body: '<main/>', bootstrap: { buildId: 'b2' } })],
  ])('falls back to a document load for %s', async (_case, html) => {
    const { click, assign, calls } = setup({ pages: { '/b': html } });
    click(document.getElementById('to-b')!);
    await flush();
    expect(assign).toHaveBeenCalledWith('http://localhost:3000/b');
    expect(calls).not.toContain('leavePage');
  });

  it('falls back on network failure and swaps a router error page with its URL', async () => {
    const { click, assign } = setup({
      pages: { '/b': '404:' + page({ title: 'Not found', body: '<main>404</main>' }) },
    });
    click(document.getElementById('to-b')!);
    await flush();
    expect(assign).not.toHaveBeenCalled();
    expect(location.pathname).toBe('/b');
    expect(document.querySelector('main')!.textContent).toBe('404');
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    document.querySelector('main')!.insertAdjacentHTML('beforeend', '<a id="c" href="/c">c</a>');
    click(document.getElementById('c')!);
    await flush();
    expect(assign).toHaveBeenCalledWith('http://localhost:3000/c');
  });

  it('keeps focus and selection inside a persisted element moved with moveBefore', async () => {
    const moveBefore = vi.fn(function (this: Element, node: Node, child: Node | null) {
      this.insertBefore(node, child);
    });
    (Element.prototype as unknown as { moveBefore?: unknown }).moveBefore = moveBefore;
    try {
      const { click } = setup({
        pages: {
          '/b': page({
            title: 'B',
            body: '<main><label data-surface-persist="field-box"><input value="ssr"></label></main>',
          }),
        },
      });
      document.querySelector('#field')!.outerHTML =
        '<label data-surface-persist="field-box"><input id="field" value="hello"></label>';
      const input = document.getElementById('field') as HTMLInputElement;
      input.focus();
      input.setSelectionRange(1, 3);
      click(document.getElementById('to-b')!);
      await flush();
      expect(moveBefore).toHaveBeenCalled();
      expect(document.getElementById('field')).toBe(input);
      expect(input.value).toBe('hello');
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    } finally {
      delete (Element.prototype as unknown as { moveBefore?: unknown }).moveBefore;
    }
  });

  it('never connects persist placeholders and replaces comments with the content', async () => {
    const { click } = setup({
      pages: {
        '/b': page({
          title: 'B',
          body:
            '<!--b note--><main><h1>Page B</h1><a id="back" href="/a">A</a>' +
            '<iframe data-surface-persist="map" src="/frame-b"></iframe></main>',
        }),
        '/a': page({
          title: 'A',
          body:
            '<!--a note--><main><h1>Page A</h1><a id="to-b" href="/b">B</a>' +
            '<iframe data-surface-persist="map" src="/frame-a"></iframe></main>',
        }),
      },
    });
    const persisted = document.querySelector('iframe')!;
    // The placeholders of the parsed next pages.
    const placeholders: Element[] = [];
    const parse = DOMParser.prototype.parseFromString;
    vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(function (
      this: DOMParser,
      ...args: Parameters<DOMParser['parseFromString']>
    ) {
      const parsed = parse.apply(this, args);
      placeholders.push(...parsed.querySelectorAll('iframe'));
      return parsed;
    });
    const comments = () =>
      Array.from(document.body.childNodes).flatMap(node =>
        node.nodeType === 8 && !(node as Comment).data.includes('ss:')
          ? [(node as Comment).data]
          : []
      );
    click(document.getElementById('to-b')!);
    await flush();
    expect(comments()).toEqual(['b note']);
    click(document.getElementById('back')!);
    await flush();
    expect(document.querySelector('h1')!.textContent).toBe('Page A');
    expect(comments()).toEqual(['a note']);
    // An <iframe>/<audio>/<img> placeholder would start loading once in this document.
    expect(placeholders).toHaveLength(2);
    for (const placeholder of placeholders) {
      expect(placeholder.ownerDocument).not.toBe(document);
      expect(placeholder.isConnected).toBe(false);
    }
    expect(document.querySelector('iframe')).toBe(persisted);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('moves media elements out of parsed pages once used or dropped (Chromium keeps them alive)', async () => {
    // Media elements of every parsed page, recorded when parsed.
    const parsed: Element[][] = [];
    const parse = DOMParser.prototype.parseFromString;
    vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(function (
      this: DOMParser,
      ...args: Parameters<DOMParser['parseFromString']>
    ) {
      const result = parse.apply(this, args);
      parsed.push([...result.querySelectorAll('audio,video')]);
      return result;
    });
    const owned = (elements: Element[]) => elements.map(el => el.ownerDocument === document);
    const media = (body: string) =>
      page({
        title: 'M',
        body: `<main><h1>Media</h1><a id="to-c" href="/c">c</a>${body}</main>`,
      });
    const { click, actionEnd } = setup({
      pages: {
        '/b': media(
          '<div data-surface-persist="player"><audio src="/next.mp3"></audio></div><video></video>'
        ),
        '/c': media('<audio src="/c.mp3"></audio>'),
      },
    });
    document
      .querySelector('main')!
      .insertAdjacentHTML('beforeend', '<div data-surface-persist="player"><audio></audio></div>');
    const playing = document.querySelector('audio')!;
    click(document.getElementById('to-b')!);
    await flush();
    // The persisted player stays; the placeholder's audio left the parsed page too.
    expect(document.querySelector('audio')).toBe(playing);
    expect(parsed).toHaveLength(1);
    expect(owned(parsed[0])).toEqual([true, true]);
    expect(document.querySelectorAll('video')).toHaveLength(1);
    // A prefetched page dropped by an action end gives its media back as well.
    document
      .getElementById('to-c')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    await flush();
    expect(parsed).toHaveLength(2);
    expect(owned(parsed[1])).toEqual([false]);
    actionEnd();
    await flush();
    expect(owned(parsed[1])).toEqual([true]);
  });

  it('re-requests the page on back and restores the saved scroll position', async () => {
    const { click, fetches, events } = setup();
    click(document.getElementById('to-b')!);
    await flush();
    const state = history.state;
    expect(state.__surface.index).toBe(1);
    history.replaceState({ __surface: { index: 0, scroll: [0, 120] } }, '', '/a');
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    await flush();
    expect(fetches.map(fetch => fetch.url)).toEqual([
      'http://localhost:3000/b',
      'http://localhost:3000/a',
    ]);
    expect(events.at(-2)![1]).toMatchObject({ trigger: 'popstate', direction: 'back' });
    expect(scrollTo).toHaveBeenCalledWith(0, 120);
    expect(document.querySelector('h1')!.textContent).toBe('Page A');
  });

  it('looks up history and fetch on every call (instrumentation wraps them later, 8.3 ③)', async () => {
    const { click } = setup();
    const wrappedFetch = vi.fn(globalThis.fetch);
    vi.stubGlobal('fetch', wrappedFetch);
    const original = history.pushState.bind(history);
    const pushState = vi.spyOn(history, 'pushState').mockImplementation(original);
    click(document.getElementById('to-b')!);
    await flush();
    expect(wrappedFetch).toHaveBeenCalledOnce();
    expect(pushState).toHaveBeenCalledOnce();
  });

  it('pushes surface.page_view to dataLayer on load and every navigation when enabled', async () => {
    (globalThis as { dataLayer?: unknown[] }).dataLayer = [];
    const { click } = setup({
      router: { dataLayer: true },
      pages: {
        '/b': page({
          title: 'B',
          body: '<main>B</main>',
          bootstrap: { router: { dataLayer: true } },
        }),
      },
    });
    click(document.getElementById('to-b')!);
    await flush();
    expect((globalThis as { dataLayer?: unknown[] }).dataLayer).toEqual([
      { event: 'surface.page_view', page_path: '/a', page_title: 'A' },
      { event: 'surface.page_view', page_path: '/b', page_title: 'B' },
    ]);
    delete (globalThis as { dataLayer?: unknown[] }).dataLayer;
  });
});

describe('persistPlan (DC-19)', () => {
  it('pairs persist IDs with the same tag and component and maps instances to their next keys', () => {
    const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html').body;
    const current = doc(
      '<h-island data-island="$0" data-surface-persist="player"></h-island>' +
        '<h-state name="chat" data-surface-persist="chat"></h-state>' +
        '<video data-surface-persist="intro"></video><iframe data-surface-persist="map"></iframe>' +
        '<h-island data-island="$1" data-surface-persist="other"></h-island>'
    );
    const next = doc(
      '<h-state name="chat" data-surface-persist="chat"></h-state>' +
        '<h-island data-island="$4" data-surface-persist="player"></h-island>' +
        '<video data-surface-persist="intro"></video><div data-surface-persist="map"></div>' +
        '<h-island data-island="$5" data-surface-persist="other"></h-island>'
    );
    const base = { buildId: 'b', pageId: 'p', basePath: '' };
    const plan = persistPlan(
      {
        ...base,
        slots: [
          { id: '$0', mode: 'client', component: 'P#default', props: {}, persist: 'player' },
          { id: 'chat', mode: 'client', component: 'C#default', persist: 'chat' },
          { id: '$1', mode: 'client', component: 'A#default', props: {}, persist: 'other' },
        ],
      },
      {
        ...base,
        slots: [
          { id: 'chat', mode: 'client', component: 'C#default', persist: 'chat' },
          { id: '$4', mode: 'client', component: 'P#default', props: { v: 2 }, persist: 'player' },
          { id: '$5', mode: 'client', component: 'B#default', props: {}, persist: 'other' },
        ],
      },
      current,
      next
    );
    expect(plan.elements.map(pair => pair.id)).toEqual(['player', 'chat', 'intro']);
    expect([...plan.slots]).toEqual(['chat']);
    expect([...plan.instances]).toEqual([
      ['$0', { key: '$4', meta: expect.objectContaining({ props: { v: 2 } }) }],
      ['chat', { key: 'chat', meta: expect.objectContaining({ persist: 'chat' }) }],
    ]);
  });
});

describe('prefetch (DC-20, DESIGN 10.3)', () => {
  const hover = (el: Element) =>
    el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));

  it('prefetches after 65ms of hover and uses the entry once for the navigation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { click, fetches } = setup();
      const link = document.getElementById('to-b')!;
      hover(link);
      await vi.advanceTimersByTimeAsync(30);
      expect(fetches).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(40);
      expect(fetches).toHaveLength(1);
      expect(fetches[0].init.headers).toMatchObject({ Purpose: 'prefetch' });
      click(link);
      await vi.advanceTimersByTimeAsync(20);
      expect(fetches).toHaveLength(1);
      expect(location.pathname).toBe('/b');
    } finally {
      vi.useRealTimers();
    }
  });

  it('expires entries after the TTL, keeps at most cacheSize and empties on action end', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    const { router, actionEnd } = setup({ router: { cacheSize: 2, cacheTtl: 500 } });
    const main = document.querySelector('main')!;
    main.insertAdjacentHTML(
      'beforeend',
      '<a id="l1" href="/one">1</a><a id="l2" href="/two">2</a><a id="l3" href="/three">3</a>'
    );
    for (const id of ['l1', 'l2', 'l3'])
      document
        .getElementById(id)!
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect([...router.cache.keys()]).toEqual([
      'http://localhost:3000/two',
      'http://localhost:3000/three',
    ]);
    actionEnd();
    expect(router.cache.size).toBe(0);
  });

  it('skips automatic prefetch with Save-Data but still prefetches on tap, and honors data-prefetch', async () => {
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { fetches } = setup();
      const link = document.getElementById('to-b')!;
      hover(link);
      await vi.advanceTimersByTimeAsync(100);
      expect(fetches).toHaveLength(0);
      link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(fetches).toHaveLength(1);
      link.setAttribute('data-prefetch', 'false');
      link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(fetches).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prefetches viewport links when visible and load links when idle', async () => {
    const observed: Element[] = [];
    let callback!: IntersectionObserverCallback;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        unobserve() {}
        disconnect() {}
      }
    );
    vi.stubGlobal('requestIdleCallback', (run: () => void) => setTimeout(run, 0));
    const { click, fetches } = setup({
      pages: {
        '/b': page({
          title: 'B',
          body:
            '<main><a id="v" href="/v" data-prefetch="viewport">v</a>' +
            '<a id="l" href="/l" data-prefetch="load">l</a></main>',
        }),
      },
    });
    click(document.getElementById('to-b')!);
    await flush();
    // Links are collected when a page loads.
    expect(observed.map(el => el.id)).toEqual(['v']);
    expect(fetches.map(fetch => new URL(fetch.url).pathname)).toEqual(['/b', '/l']);
    callback(
      [{ isIntersecting: true, target: observed[0] } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    );
    expect(fetches.map(fetch => new URL(fetch.url).pathname)).toEqual(['/b', '/l', '/v']);
  });
});
