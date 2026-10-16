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
  it('GET / returns SSR-rendered home page', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="page:hero"');
    expect(res.text).toContain('<h-state name="page:concepts"');
    expect(res.text).toContain('<h-state name="page:features"');
    expect(res.text).toContain('StateSurface');
    expect(res.text).toContain('id="__SURFACE__"');
    expect(res.text).not.toContain('data-ssr-hash');
  });

  it('GET /examples/search returns SSR-rendered search page', async () => {
    const res = await request(app).get('/examples/search');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="search:input"');
    expect(res.text).toContain('<h-state name="search:results"');
    expect(res.text).toContain('id="__SURFACE__"');
    expect(res.text).toContain('Search');
  });

  it('GET /guide/surface returns SSR-rendered guide page', async () => {
    const res = await request(app).get('/guide/surface');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="guide:content"');
    expect(res.text).toContain('<h-state name="guide:toc"');
    expect(res.text).toContain('id="__SURFACE__"');
  });

  it('GET /examples/streaming returns SSR-rendered streaming page', async () => {
    const res = await request(app).get('/examples/streaming');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<h-state name="demo:controls"');
    expect(res.text).toContain('<h-state name="demo:timeline"');
    expect(res.text).toContain('<h-state name="demo:output"');
    expect(res.text).toContain('id="__SURFACE__"');
  });

  it('GET /examples/actions returns SSR-rendered actions page', async () => {
    const res = await request(app).get('/examples/actions');

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
  it('GET /guide/surface records the boot transition', async () => {
    const res = await request(app).get('/guide/surface');
    expect(bootstrapOf(res.text).boot).toEqual([
      { transition: 'guide-load', params: { slug: 'surface', lang: 'en' } },
    ]);
    expect(res.text).not.toContain('__BOOT__');
  });

  it('pages without <Boot> have no boot entries', async () => {
    for (const path of ['/', '/examples/search'])
      expect(bootstrapOf((await request(app).get(path)).text).boot).toBeUndefined();
  });
});

describe('empty anchors', () => {
  it('GET / includes only home-specific slots', async () => {
    const res = await request(app).get('/');

    expect(res.text).toContain('name="page:hero"');
    expect(res.text).toContain('name="page:concepts"');
    expect(res.text).toContain('name="page:features"');
    expect(res.text).not.toContain('name="guide:content"');
    expect(res.text).not.toContain('name="demo:controls"');
    expect(res.text).not.toContain('name="search:input"');
    expect(res.text).not.toContain('name="search:results"');
  });

  it('GET /examples/search leaves search:results empty initially', async () => {
    const res = await request(app).get('/examples/search');

    // search:results has no initial state
    expect(res.text).toMatch(/<h-state name="search:results"[^>]*><\/h-state>/);
  });
});

describe('response headers', () => {
  it('GET / sends HTML content type and default security headers', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html; charset=utf-8');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('allows disabling default security headers', async () => {
    const res = await request(appWithoutSecurityHeaders).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBeUndefined();
    expect(res.headers['x-frame-options']).toBeUndefined();
  });
});
