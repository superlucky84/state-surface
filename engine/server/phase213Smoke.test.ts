import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDemo } from '../../testing/server.js';

let app: any;

/** Language of the header's active switch link (the header is a static slot, no props). */
function headerLang(html: string): string | undefined {
  const header = /<h-state name="page:header"[^>]*>([\s\S]*?)<\/h-state>/.exec(html)?.[1] ?? '';
  for (const link of header.match(/<a [^>]*hreflang="[^"]+"[^>]*>/g) ?? [])
    if (link.includes('aria-current="true"')) return /hreflang="([^"]+)"/.exec(link)?.[1];
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
    // Sidebar beside the article from md up, a sticky table of contents.
    expect(guide.text).toMatch(/<main class="[^"]*\bflex-col\b[^"]*\bmd:flex-row\b/);
    expect(guide.text).toContain('w-full md:w-56 md:shrink-0');
    expect(guide.text).toMatch(/<nav class="[^"]*\bmd:sticky\b/);
    // Narrow screens: guides in one horizontally scrolling row; a vertical list from md up.
    const row = /<div data-guide-nav-scroll="[^"]*" class="([^"]+)"/.exec(guide.text)?.[1] ?? '';
    expect(row.split(' ')).toEqual(expect.arrayContaining(['flex', 'overflow-x-auto', 'md:block']));
    const active = /<a data-guide-active="true"[^>]*class="([^"]+)"/.exec(guide.text)?.[1] ?? '';
    expect(active.split(' ')).toEqual(
      expect.arrayContaining(['inline-flex', 'whitespace-nowrap', 'md:flex', 'md:w-full'])
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
