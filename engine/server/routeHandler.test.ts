import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createDemo } from '../../testing/server.js';

let app: any;
let appWithoutSecurityHeaders: any;
beforeAll(async () => {
  ({ server: app } = await createDemo());
  ({ server: appWithoutSecurityHeaders } = await createDemo({ security: { headers: false } }));
});

describe('multi-route SSR', () => {
  it('GET /en returns SSR-rendered home page', async () => {
    const res = await request(app).get('/en');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<html lang="en">');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="page:hero"');
    expect(res.text).toContain('<h-state name="page:concepts"');
    expect(res.text).toContain('<h-state name="page:features"');
    expect(res.text).toContain('StateSurface');
    expect(res.text).toContain('id="__SURFACE__"');
    expect(res.text).not.toContain('data-ssr-hash');
  });

  it('GET /ko renders the home page in Korean', async () => {
    const res = await request(app).get('/ko');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<html lang="ko">');
    expect(res.text).toContain('<h-state name="page:hero"');
  });

  it('GET / redirects to a language path', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/en');
  });

  it('GET /en/examples/search returns SSR-rendered search page', async () => {
    const res = await request(app).get('/en/examples/search');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="search:input"');
    expect(res.text).toContain('<h-state name="search:results"');
    expect(res.text).toContain('id="__SURFACE__"');
    expect(res.text).toContain('Search');
  });

  it('GET /en/guide/surface returns the prerendered guide page', async () => {
    const res = await request(app).get('/en/guide/surface');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="guide:toc"');
    // The guide body is the Markdown collection entry rendered into the page, not a slot.
    expect(res.text).not.toContain('<h-state name="guide:content"');
    expect(res.text).toContain('id="tldr"');
    expect(res.text).toContain('id="__SURFACE__"');
  });

  it('GET /en/examples/streaming returns SSR-rendered streaming page', async () => {
    const res = await request(app).get('/en/examples/streaming');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<h-state name="demo:controls"');
    expect(res.text).toContain('<h-state name="demo:timeline"');
    expect(res.text).toContain('<h-state name="demo:output"');
    expect(res.text).toContain('id="__SURFACE__"');
  });

  it('GET /en/examples/actions returns SSR-rendered actions page', async () => {
    const res = await request(app).get('/en/examples/actions');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<h-state name="actions:playground"');
    expect(res.text).toContain('<h-state name="actions:log"');
    expect(res.text).toContain('id="__SURFACE__"');
  });
});

const bootstrapOf = (html: string) =>
  JSON.parse(
    html.match(/<script id="__SURFACE__" type="application\/json">([\s\S]*?)<\/script>/)![1]
  );

describe('<Boot> in __SURFACE__', () => {
  it('demo pages have no boot entries (the guide is prerendered, not loaded by <Boot>)', async () => {
    for (const path of ['/en/guide/surface', '/en', '/en/examples/search']) {
      const res = await request(app).get(path);
      expect(bootstrapOf(res.text).boot).toBeUndefined();
      expect(res.text).not.toContain('__BOOT__');
    }
  });
});

describe('empty anchors', () => {
  it('GET /en includes only home-specific slots', async () => {
    const res = await request(app).get('/en');

    expect(res.text).toContain('name="page:hero"');
    expect(res.text).toContain('name="page:concepts"');
    expect(res.text).toContain('name="page:features"');
    expect(res.text).not.toContain('name="guide:content"');
    expect(res.text).not.toContain('name="guide:toc"');
    expect(res.text).not.toContain('name="demo:controls"');
    expect(res.text).not.toContain('name="search:input"');
    expect(res.text).not.toContain('name="search:results"');
  });

  it('GET /en/examples/search leaves search:results empty initially', async () => {
    const res = await request(app).get('/en/examples/search');

    // search:results has no initial state
    expect(res.text).toMatch(/<h-state name="search:results"[^>]*><\/h-state>/);
  });
});

describe('response headers', () => {
  // `/en` is prerendered (restricted context), `/en/examples/search` renders per request.
  for (const path of ['/en', '/en/examples/search']) {
    it(`GET ${path} sends HTML content type and default security headers`, async () => {
      const res = await request(app).get(path);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html; charset=utf-8');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it(`allows disabling default security headers (GET ${path})`, async () => {
      const res = await request(appWithoutSecurityHeaders).get(path);

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBeUndefined();
      expect(res.headers['x-frame-options']).toBeUndefined();
    });
  }
});
