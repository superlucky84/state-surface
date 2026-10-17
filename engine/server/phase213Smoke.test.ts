import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDemo } from '../../testing/server.js';

let app: any;

/** Language of the header's active switch link (the header is a static slot, no props). */
function headerLang(html: string): string | undefined {
  const header = /<h-state name="page:header"[^>]*>([\s\S]*?)<\/h-state>/.exec(html)?.[1] ?? '';
  for (const link of header.match(/<a [^>]*hreflang="[^"]+"[^>]*>/g) ?? [])
    if (link.includes('aria-current="true"') && link.includes('bg-slate-900 text-white'))
      return /hreflang="([^"]+)"/.exec(link)?.[1];
  return undefined;
}

/** A page path in a language: `/ko` + `/examples/search`. */
const localPath = (lang: string, route: string) => `/${lang}${route === '/' ? '' : route}`;

beforeAll(async () => {
  ({ server: app } = await createDemo({}));
});

describe('phase 2-13 smoke coverage', () => {
  it('guide page renders a mobile-friendly toc layout', async () => {
    const guide = await request(app).get('/en/guide/quickstart');
    expect(guide.status).toBe(200);
    expect(guide.text).toContain('flex-col gap-4 pb-8 pt-4 md:flex-row md:gap-8 md:pt-6');
    expect(guide.text).toContain('w-full md:w-56 md:shrink-0');
    expect(guide.text).toContain('space-y-2 md:sticky md:top-6 md:space-y-1');
    expect(guide.text).toContain('data-guide-nav-scroll');
    expect(guide.text).toContain('data-guide-active="true"');
    expect(guide.text).toContain(
      '-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:block md:space-y-1 md:overflow-visible md:px-0 md:pb-0'
    );
    expect(guide.text).toContain(
      'inline-flex w-auto whitespace-nowrap rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white md:block md:w-full'
    );
  });

  it('search/actions/chat pages expose declarative data-action bindings', async () => {
    const search = await request(app).get('/en/examples/search');
    expect(search.status).toBe(200);
    expect(search.text).toContain('data-action="search"');
    expect(search.text).toContain('data-pending-targets="search:results"');

    const actions = await request(app).get('/en/examples/actions');
    expect(actions.status).toBe(200);
    expect(actions.text).toContain('data-action="action-demo"');
    expect(actions.text).toContain('data-pending-targets="actions:log"');

    const chat = await request(app).get('/en/examples/chat');
    expect(chat.status).toBe(200);
    expect(chat.text).toContain('data-action="chat"');
    expect(chat.text).toContain('data-pending-targets="chat:messages,chat:current,chat:typing"');
  });

  it('major pages switch between en/ko via language path', async () => {
    const routes = [
      '/',
      '/guide/surface',
      '/examples/streaming',
      '/examples/actions',
      '/examples/search',
      '/examples/chat',
    ];

    for (const route of routes) {
      for (const lang of ['en', 'ko']) {
        const res = await request(app).get(localPath(lang, route));
        expect(res.status).toBe(200);
        expect(res.text).toContain(`<html lang="${lang}">`);
        expect(headerLang(res.text)).toBe(lang);
      }

      // A path without a language redirects by the lang cookie (default: en).
      const neutral = await request(app).get(route);
      expect(neutral.status).toBe(302);
      expect(neutral.headers.location).toBe(localPath('en', route));
      const ko = await request(app).get(route).set('Cookie', 'lang=ko');
      expect(ko.status).toBe(302);
      expect(ko.headers.location).toBe(localPath('ko', route));
    }
  });

  it('lang cookie from the header language link is preserved across MPA navigation', async () => {
    const home = await request(app).get('/en');
    const href = /<a href="([^"]+)" hreflang="ko"/.exec(home.text)?.[1];
    expect(href).toBe('/ko?lang=ko');

    const switched = await request(app).get(href!);
    expect(switched.status).toBe(302);
    expect(switched.headers.location).toBe('/ko');
    const setCookieHeader = switched.headers['set-cookie']?.[0];
    expect(setCookieHeader).toBeDefined();
    const cookiePair = (setCookieHeader ?? '').split(';')[0];
    expect(cookiePair).toBe('lang=ko');

    const routes = ['/examples/search', '/examples/actions', '/examples/chat'];
    for (const route of routes) {
      const redirect = await request(app).get(route).set('Cookie', cookiePair);
      expect(redirect.status).toBe(302);
      expect(redirect.headers.location).toBe(localPath('ko', route));
      const res = await request(app).get(redirect.headers.location).set('Cookie', cookiePair);
      expect(res.status).toBe(200);
      expect(headerLang(res.text)).toBe('ko');
    }
  });
});
