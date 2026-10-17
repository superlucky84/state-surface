import { describe, it, expect } from 'vitest';
import { h } from 'lithent';
import { createHandler, type HandlerOptions } from './core/handler.js';
import { defineManifest } from './core/manifest.js';
import type { SurfaceContext } from './core/context.js';
import { negotiate } from './i18n.js';

const ORIGIN = 'https://surface.test';
const I18N = { locales: ['en', 'ko'], defaultLocale: 'en' };

const page = (prerender = false) => ({
  prerender,
  ...(prerender ? { getStaticPaths: () => [{ lang: 'en', slug: 'x' }] } : {}),
  default: (ctx: SurfaceContext) =>
    h(
      'html',
      { lang: ctx.i18n?.lang ?? '' },
      h('head', {}, h('title', {}, 'T')),
      h(
        'body',
        {},
        h('p', { id: 'info' }, JSON.stringify({ ...ctx.i18n, params: ctx.params })),
        h('a', { id: 'switch', href: ctx.i18n?.switchHref('ko') }, 'ko')
      )
    ),
});

function fixture(options: Partial<HandlerOptions> & { site?: string; prerender?: boolean } = {}) {
  const { site, prerender, ...rest } = options;
  return createHandler({
    development: false,
    ...rest,
    manifest: defineManifest({
      buildId: 'b',
      i18n: I18N,
      ...(site ? { site } : {}),
      ...(rest.basePath ? { basePath: rest.basePath } : {}),
      routes: [
        { pattern: '/:lang', module: page() as never },
        { pattern: '/:lang/guide/:slug', module: page(prerender) as never },
        { pattern: '/about', module: page() as never },
      ],
      transitions: {},
    }),
  });
}
const get = (handler: ReturnType<typeof createHandler>, path: string, headers = {}) =>
  handler.fetch(new Request(ORIGIN + path, { headers }));
const info = async (response: Response) =>
  JSON.parse(
    (await response.text())
      .match(/<p id="info">(.*?)<\/p>/)![1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
  );

describe('Accept-Language negotiation', () => {
  it.each([
    ['ko-KR,ko;q=0.9,en;q=0.8', 'ko'],
    ['fr;q=1, en;q=0.5', 'en'],
    ['en-GB', 'en'],
    ['de, *;q=0.1', undefined],
    ['ko;q=0, en;q=0.2', 'en'],
    [null, undefined],
  ])('%s → %s', (header, expected) => {
    expect(negotiate(header, ['en', 'ko'])).toBe(expected);
  });
});

describe('language paths (DC-24 ⑤)', () => {
  it('match configured locales only and give pages ctx.i18n', async () => {
    const handler = fixture();
    const response = await get(handler, '/ko/guide/intro');
    expect(response.status).toBe(200);
    expect(await info(response)).toMatchObject({
      lang: 'ko',
      locales: ['en', 'ko'],
      defaultLocale: 'en',
      path: '/guide/intro',
      neutralHref: '/guide/intro',
      params: { lang: 'ko', slug: 'intro' },
    });
    expect((await get(handler, '/fr/guide/intro')).status).toBe(404);
    // Routes outside [lang] are unaffected.
    expect((await get(handler, '/about')).status).toBe(200);
  });

  it('redirect paths without a language by cookie, then Accept-Language, then the default', async () => {
    const handler = fixture();
    const location = async (path: string, headers = {}) => {
      const response = await get(handler, path, headers);
      expect(response.status).toBe(302);
      expect(response.headers.get('vary')).toBe('cookie, accept-language');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      return response.headers.get('location');
    };
    expect(await location('/guide/intro?x=1', { 'accept-language': 'ko-KR,ko' })).toBe(
      '/ko/guide/intro?x=1'
    );
    expect(await location('/guide/intro', { 'accept-language': 'ko', cookie: 'lang=en' })).toBe(
      '/en/guide/intro'
    );
    expect(await location('/', { cookie: 'lang=xx' })).toBe('/en');
    expect((await get(handler, '/guide')).status).toBe(404);
  });

  it('switch with ?lang=, remember it in a cookie, and never switch on prefetch', async () => {
    const handler = fixture();
    const page = await get(handler, '/en/guide/intro');
    expect(await page.text()).toContain('href="/ko/guide/intro?lang=ko"');

    const switched = await get(handler, '/ko/guide/intro?lang=ko&tab=2');
    expect(switched.status).toBe(302);
    expect(switched.headers.get('location')).toBe('/ko/guide/intro?tab=2');
    expect(switched.headers.get('set-cookie')).toMatch(
      /^lang=ko; Path=\/; SameSite=Lax; Max-Age=31536000/
    );

    const across = await get(handler, '/ko/guide/intro?lang=en');
    expect(across.headers.get('location')).toBe('/en/guide/intro');

    const neutral = await get(handler, '/guide/intro?lang=ko', { cookie: 'lang=en' });
    expect(neutral.headers.get('location')).toBe('/ko/guide/intro');
    expect(neutral.headers.get('set-cookie')).toMatch(/^lang=ko;/);

    for (const header of [{ purpose: 'prefetch' }, { 'sec-purpose': 'prefetch;prerender' }]) {
      const prefetched = await get(handler, '/ko/guide/intro?lang=ko', header);
      expect(prefetched.status).toBe(204);
      expect(prefetched.headers.get('set-cookie')).toBeNull();
    }
    // An unknown ?lang value is just a query parameter.
    expect((await get(handler, '/en/guide/intro?lang=fr')).status).toBe(200);
  });

  it('write hreflang alternates with x-default: request origin, site, or root-relative', async () => {
    const live = await (await get(fixture(), '/ko/guide/intro')).text();
    expect(live).toContain(
      '<link rel="alternate" hreflang="en" href="https://surface.test/en/guide/intro" data-ss>' +
        '<link rel="alternate" hreflang="ko" href="https://surface.test/ko/guide/intro" data-ss>' +
        '<link rel="alternate" hreflang="x-default" href="https://surface.test/guide/intro" data-ss>'
    );
    const prerendered = await (await get(fixture({ prerender: true }), '/en/guide/x')).text();
    expect(prerendered).toContain(
      '<link rel="alternate" hreflang="ko" href="/ko/guide/x" data-ss>'
    );
    const site = await (
      await get(fixture({ prerender: true, site: 'https://docs.example' }), '/en/guide/x')
    ).text();
    expect(site).toContain('hreflang="x-default" href="https://docs.example/guide/x"');
  });

  it('keep BASE_PATH in redirects and links', async () => {
    const handler = fixture({ basePath: '/demo' });
    const redirect = await get(handler, '/demo/guide/intro', { 'accept-language': 'ko' });
    expect(redirect.headers.get('location')).toBe('/demo/ko/guide/intro');
    expect((await get(handler, '/demo/')).headers.get('location')).toBe('/demo/en');
    const html = await (await get(handler, '/demo/en')).text();
    expect(html).toContain('href="/demo/ko?lang=ko"');
    expect(html).toContain('hreflang="x-default" href="https://surface.test/demo/"');
  });

  it('validate the configuration', () => {
    const define = (i18n: { locales: string[]; defaultLocale: string }) =>
      defineManifest({ i18n, routes: [], transitions: {} });
    expect(() => define({ locales: [], defaultLocale: 'en' })).toThrow('at least one locale');
    expect(() => define({ locales: ['en', 'EN_us'], defaultLocale: 'en' })).toThrow('"EN_us"');
    expect(() => define({ locales: ['en'], defaultLocale: 'ko' })).toThrow('not in i18n.locales');
    expect(() => defineManifest({ site: 'https://x.test/', routes: [], transitions: {} })).toThrow(
      'site must be an origin'
    );
  });
});
