import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createDemo } from '../../testing/server.js';

let app: any;
beforeAll(async () => {
  ({ server: app } = await createDemo());
});

describe('dynamic param validation', () => {
  it('GET /en/guide/surface works with valid slug', async () => {
    const res = await request(app).get('/en/guide/surface');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
  });

  it('GET /ko/guide/template works with valid slug', async () => {
    const res = await request(app).get('/ko/guide/template');

    expect(res.status).toBe(200);
  });

  it('GET /en/guide/nonexistent returns 404 (prerendered routes answer listed params only)', async () => {
    const res = await request(app).get('/en/guide/nonexistent');

    expect(res.status).toBe(404);
    expect(res.text).toContain('Not Found');
  });
});

describe('language paths', () => {
  it('GET /examples/search redirects to the language from the lang cookie', async () => {
    const res = await request(app).get('/examples/search').set('cookie', 'lang=ko');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/ko/examples/search');
  });

  it('GET /en/examples?lang=ko switches language, remembers it and drops the query', async () => {
    const res = await request(app).get('/en/examples?lang=ko');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/ko/examples');
    expect(String(res.headers['set-cookie'])).toMatch(/^lang=ko;/);
  });

  it('GET /fr/examples returns 404 (only configured locales match)', async () => {
    const res = await request(app).get('/fr/examples');

    expect(res.status).toBe(404);
  });
});

describe('404 handling', () => {
  it('GET /nonexistent returns 404', async () => {
    const res = await request(app).get('/nonexistent');

    expect(res.status).toBe(404);
    expect(res.text).toContain('Not Found');
  });

  it('GET /article returns 404 (removed route)', async () => {
    const res = await request(app).get('/article');

    expect(res.status).toBe(404);
  });

  it('GET /admin/whatever returns 404', async () => {
    const res = await request(app).get('/admin/whatever');

    expect(res.status).toBe(404);
  });
});

describe('cross-route navigation links', () => {
  it('GET /en includes navigation links to other routes', async () => {
    const res = await request(app).get('/en');

    // Header template includes nav links in the page language
    expect(res.text).toContain('href="/en"');
    expect(res.text).toContain('href="/en/guide/surface"');
    expect(res.text).toContain('href="/en/examples"');
    // ...and a language switch to the same page
    expect(res.text).toContain(
      '<a href="/ko?lang=ko" hreflang="ko" lang="ko" data-prefetch="false"'
    );
  });

  it('GET /ko/examples/search includes same navigation links in Korean', async () => {
    const res = await request(app).get('/ko/examples/search');

    expect(res.text).toContain('href="/ko"');
    expect(res.text).toContain('href="/ko/examples"');
    expect(res.text).toContain(
      '<a href="/en/examples/search?lang=en" hreflang="en" lang="en" data-prefetch="false"'
    );
  });
});

describe('all routes render valid HTML', () => {
  // Prerendered pages render through the restricted prerender context: no CSP nonce.
  const routes: Array<[route: string, prerendered: boolean]> = [
    ['/en', true],
    ['/ko', true],
    ['/en/examples/search', false],
    ['/en/guide/surface', true],
    ['/en/examples/streaming', true],
    ['/en/examples/actions', false],
  ];

  for (const [route, prerendered] of routes) {
    it(`GET ${route} returns valid HTML document`, async () => {
      const res = await request(app).get(route);

      expect(res.status).toBe(200);
      expect(res.text).toContain('<!doctype html>');
      expect(res.text).toContain(`<html lang="${route.split('/')[1]}">`);
      expect(res.text).toContain('</html>');
      if (prerendered) expect(res.text).not.toContain('nonce=');
      expect(res.text).toMatch(
        prerendered
          ? /<script type="module" src="\/engine\/client\/loader.ts" data-ss><\/script>/
          : /<script type="module" src="\/engine\/client\/loader.ts" nonce="[0-9a-f]+" data-ss><\/script>/
      );
    });
  }
});
