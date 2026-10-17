import { describe, it, expect, vi } from 'vitest';
import { h } from 'lithent';
import { createHandler, type HandlerOptions } from './core/handler.js';
import { defineManifest } from './core/manifest.js';
import type { Middleware, SurfaceContext } from './core/context.js';
import { PrerenderAccessError } from './prerenderContext.js';
import { Island, Slot } from '../shared/surfaceTree.js';

const SECRET = 's'.repeat(32);
const ORIGIN = 'https://surface.test';

const Note = (props: { text: string }) => h('p', { class: 'note' }, props.text);
const doc = (...body: unknown[]) =>
  h('html', {}, h('head', {}, h('title', {}, 'T')), h('body', {}, ...(body as never[])));

/** One page module per case; `read` is what the page touches on the context. */
function page(read?: (ctx: SurfaceContext) => unknown, prerender = true) {
  return {
    prerender,
    default: async (ctx: SurfaceContext) =>
      doc(
        h('h1', {}, `page ${ctx.params.slug ?? ''} ${String(read?.(ctx) ?? '')}`),
        h(
          Slot as never,
          { name: 'note', mode: 'server' } as never,
          h(
            Island as never,
            { __ssComponent: Note, __ssId: 'Note.tsx#default', text: 'note' } as never
          )
        ),
        h('button', { 'data-action': 'ping' }, 'Ping')
      ),
  };
}

function fixture(options: Partial<HandlerOptions> & { pages?: Record<string, unknown> } = {}) {
  const { pages, ...rest } = options;
  const routes = Object.entries(
    pages ?? {
      '/pre': page(),
      '/docs/:slug': {
        ...page(),
        getStaticPaths: vi.fn(() => [{ slug: 'one' }, { slug: 'two' }]),
      },
      '/live': page(undefined, false),
    }
  ).map(([pattern, module]) => ({ pattern, module: module as never }));
  return createHandler({
    development: false,
    secret: SECRET,
    ...rest,
    manifest: defineManifest({
      buildId: 'build-1',
      routes,
      transitions: {},
      document: {
        engine: {
          loader: '/engine/client/loader.ts',
          runtime: '/engine/client/runtime.ts',
          bridge: '/engine/client/lithentBridge.ts',
        },
      },
    }),
  });
}

const get = (handler: ReturnType<typeof createHandler>, path: string, init: RequestInit = {}) =>
  handler.fetch(new Request(ORIGIN + path, init));

describe('prerendered pages (DC-24, DC-32)', () => {
  it('answer with the stored HTML after the middleware: headers, ETag, 304 and early responses', async () => {
    const stored = new Map([
      ['pre/index.html', '<!doctype html><p>built pre</p>'],
      ['docs/one/index.html', '<!doctype html><p>built one</p>'],
    ]);
    const readStatic = vi.fn(async (file: string) =>
      stored.has(file) ? new Response(stored.get(file)) : null
    );
    const seen: Array<{ path: string; prerendered: boolean; cookie?: string }> = [];
    const middleware: Middleware[] = [
      async (ctx, next) => {
        // Middleware keeps the full context: cookies work on prerendered requests too.
        seen.push({
          path: ctx.url.pathname,
          prerendered: ctx.route.prerendered,
          cookie: ctx.cookies.get('user'),
        });
        if (ctx.url.pathname === '/docs/one' && ctx.cookies.get('user') !== 'ok')
          return new Response('Unauthorized', { status: 401 });
        const response = await next();
        const headers = new Headers(response.headers);
        headers.set('x-frame', ctx.route.prerendered ? 'prerendered' : 'rendered');
        return new Response(response.body, { status: response.status, headers });
      },
    ];
    const handler = fixture({ readStatic, middleware });

    const response = await get(handler, '/pre');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<!doctype html><p>built pre</p>');
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
      etag: '"build-1"',
      'x-frame': 'prerendered',
      'x-surface-build': 'build-1',
    });
    expect(readStatic).toHaveBeenCalledWith(
      'pre/index.html',
      expect.objectContaining({ origin: ORIGIN })
    );

    const cached = await get(handler, '/pre', { headers: { 'if-none-match': 'W/"build-1"' } });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');
    expect(cached.headers.get('etag')).toBe('"build-1"');
    expect((await get(handler, '/pre', { headers: { 'if-none-match': '"old"' } })).status).toBe(
      200
    );
    const head = await get(handler, '/pre', { method: 'HEAD' });
    expect([head.status, await head.text()]).toEqual([200, '']);

    expect((await get(handler, '/docs/one')).status).toBe(401);
    const allowed = await get(handler, '/docs/one', { headers: { cookie: 'user=ok' } });
    expect(await allowed.text()).toBe('<!doctype html><p>built one</p>');
    // Not built (not in getStaticPaths): 404 without rendering.
    expect((await get(handler, '/docs/other')).status).toBe(404);
    // SSR pages still render.
    const live = await get(handler, '/live');
    expect(live.headers.get('x-frame')).toBe('rendered');
    expect(await live.text()).toContain('page');
    expect(seen.map(entry => [entry.path, entry.prerendered])).toContainEqual(['/pre', true]);
    expect(seen).toContainEqual({ path: '/docs/one', prerendered: true, cookie: 'ok' });
  });

  it('render on request without a static reader, only for params from getStaticPaths', async () => {
    const handler = fixture();
    const one = await get(handler, '/docs/one');
    expect(one.status).toBe(200);
    expect(await one.text()).toContain('page one');
    expect((await get(handler, '/docs/three')).status).toBe(404);
  });

  it('render the same HTML as SSR of the same page, without nonce attributes', async () => {
    const handler = fixture({
      pages: { '/pre': page(), '/ssr': page(undefined, false) },
    });
    const pre = await (await get(handler, '/pre')).text();
    const ssr = await (await get(handler, '/ssr')).text();
    expect(pre).not.toMatch(/nonce=/);
    expect(ssr).toMatch(/nonce="[0-9a-f]+"/);
    const strip = (html: string) =>
      html.replace(/ nonce="[0-9a-f]+"/g, '').replace(/"pageId":"[^"]*"/, '');
    expect(strip(pre)).toBe(strip(ssr));
  });

  it.each([
    ['ctx.cookies', (ctx: SurfaceContext) => ctx.cookies.get('lang')],
    ['ctx.request.headers', (ctx: SurfaceContext) => ctx.request.headers.get('accept')],
    ['ctx.locals', (ctx: SurfaceContext) => ctx.locals],
    ['ctx.nonce', (ctx: SurfaceContext) => ctx.nonce],
    ['ctx.flash()', (ctx: SurfaceContext) => ctx.flash('x')],
  ])('throw PrerenderAccessError when a prerendered page reads %s', async (property, read) => {
    const errors: unknown[] = [];
    const handler = fixture({
      pages: { '/pre': page(read) },
      onError: error => errors.push(error),
    });
    expect((await get(handler, '/pre')).status).toBe(500);
    expect(errors[0]).toBeInstanceOf(PrerenderAccessError);
    expect((errors[0] as PrerenderAccessError).property).toBe(property);
    // The build mode throws to the caller (engine/build/prerender.ts reports the location).
    const build = fixture({ pages: { '/pre': page(read) }, prerendering: true });
    await expect(get(build, '/pre')).rejects.toThrow(
      `${property} is not available while prerendering /pre`
    );
  });

  it('allow URL, params and env while prerendering, and skip the middleware at build time', async () => {
    const middleware = vi.fn<Middleware>((_ctx, next) => next());
    const handler = fixture({
      pages: {
        '/pre': page(ctx => `${ctx.url.pathname}|${ctx.env.SITE}|${ctx.route.prerendered}`),
      },
      prerendering: true,
      middleware: [middleware],
    });
    const response = await handler.fetch(new Request(ORIGIN + '/pre'), { env: { SITE: 'demo' } });
    expect(await response.text()).toContain('/pre|demo|true');
    expect(middleware).not.toHaveBeenCalled();
  });

  it('require getStaticPaths on prerendered dynamic routes and honor the build default', () => {
    expect(() =>
      defineManifest({
        routes: [{ pattern: '/docs/:slug', module: page() as never }],
        transitions: {},
      })
    ).toThrow('export getStaticPaths()');
    // `surface({ prerender: true })` makes every page prerendered unless it opts out.
    expect(() =>
      defineManifest({
        prerender: true,
        routes: [{ pattern: '/docs/:slug', module: { default: page().default } as never }],
        transitions: {},
      })
    ).toThrow('export getStaticPaths()');
    expect(() =>
      defineManifest({
        prerender: true,
        routes: [{ pattern: '/docs/:slug', module: { ...page(), prerender: false } as never }],
        transitions: {},
      })
    ).not.toThrow();
  });
});
