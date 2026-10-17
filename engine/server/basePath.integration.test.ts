import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDemo, surfaceHeaders } from '../../testing/server.js';
import { decodeFrames } from '../shared/ndjson.js';

let app: any;

beforeAll(async () => {
  ({ server: app } = await createDemo({
    basePath: '/demo',
  }));
});

describe('basePath integration', () => {
  it('serves SSR routes under BASE_PATH prefix', async () => {
    const res = await request(app).get('/demo/en/examples/search');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<h-state name="search:input"');
    expect(res.text).toContain('"basePath":"/demo"');
    // Language links and alternates (ctx.i18n) keep the prefix. Navigation links use the
    // build's prefixPath(), which this harness leaves empty (manifest basePath is unset).
    expect(res.text).toContain('href="/demo/ko/examples/search?lang=ko"');
    expect(res.text).toMatch(/hreflang="ko" href="http:\/\/[^"]+\/demo\/ko\/examples\/search"/);

    // A path without a language redirects within the prefix.
    const neutral = await request(app).get('/demo/examples/search');
    expect(neutral.status).toBe(302);
    expect(neutral.headers.location).toBe('/demo/en/examples/search');
  });

  it('serves transition endpoint under BASE_PATH prefix', async () => {
    const res = await request(app)
      .post('/demo/transition/search')
      .set(surfaceHeaders('[lang]/examples/search'))
      .send({ query: 'state-surface', lang: 'en' })
      .expect('Content-Type', /ndjson/);

    expect(res.status).toBe(200);
    const frames = decodeFrames(res.text);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0]).toMatchObject({ type: 'patch', reset: true });
    expect(frames.at(-1)).toEqual({ type: 'done' });
  });

  it('sets language cookie path using BASE_PATH', async () => {
    const res = await request(app).get('/demo/ko/examples/search?lang=ko');
    const setCookie = res.headers['set-cookie']?.[0];

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/demo/ko/examples/search');
    expect(setCookie).toContain('lang=ko');
    expect(setCookie).toContain('Path=/demo');

    // The remembered language picks the redirect target of language-less paths.
    const neutral = await request(app).get('/demo/').set('Cookie', 'lang=ko');
    expect(neutral.status).toBe(302);
    expect(neutral.headers.location).toBe('/demo/ko');
  });
});
