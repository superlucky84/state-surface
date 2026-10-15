import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDemo } from '../../testing/server.js';
import { decodeFrames } from '../shared/ndjson.js';

let app: any;

beforeAll(async () => {
  ({ server: app } = await createDemo({
    basePath: '/demo',
  }));
});

describe('basePath integration', () => {
  it('serves SSR routes under BASE_PATH prefix', async () => {
    const res = await request(app).get('/demo/examples/search');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<h-state name="search:input"');
  });

  it('serves transition endpoint under BASE_PATH prefix', async () => {
    const res = await request(app)
      .post('/demo/transition/search')
      .send({ query: 'state-surface' })
      .expect('Content-Type', /ndjson/);

    expect(res.status).toBe(200);
    const frames = decodeFrames(res.text);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some(frame => frame.type === 'state')).toBe(true);
  });

  it('sets language cookie path using BASE_PATH', async () => {
    const res = await request(app).post('/demo/transition/switch-lang').send({ lang: 'ko' });
    const setCookie = res.headers['set-cookie']?.[0];

    expect(res.status).toBe(200);
    expect(setCookie).toContain('lang=ko');
    expect(setCookie).toContain('Path=/demo');
  });
});
