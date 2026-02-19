import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './index.js';

describe('demo SSR page', () => {
  it('GET / returns SSR-rendered home HTML with filled home anchors', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="page:hero"');
    expect(res.text).toContain('<h-state name="page:concepts"');
    expect(res.text).toContain('<h-state name="page:features"');

    // SSR-filled content
    expect(res.text).toContain('StateSurface');
    expect(res.text).toContain('data-ssr-hash');

    // __STATE__ script present
    expect(res.text).toContain('id="__STATE__"');
    expect(res.text).toContain('page:header');
    expect(res.text).toContain('page:hero');
    expect(res.text).toContain('page:concepts');
    expect(res.text).toContain('page:features');
  });

  it('GET / keeps cross-page slots out of home surface', async () => {
    const res = await request(app).get('/');

    expect(res.text).not.toContain('name="guide:content"');
    expect(res.text).not.toContain('name="guide:toc"');
    expect(res.text).not.toContain('name="demo:controls"');
    expect(res.text).not.toContain('name="search:input"');
    expect(res.text).not.toContain('name="search:results"');
  });

  it('GET / without lang cookie defaults to English content', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('State-Layout Mapping Runtime');
    expect(res.text).toContain('10-Min Quickstart');
    expect(res.text).not.toContain('상태-레이아웃 매핑 런타임');
  });

  it('GET / with lang=ko cookie renders Korean content', async () => {
    const res = await request(app).get('/').set('Cookie', 'lang=ko');

    expect(res.status).toBe(200);
    expect(res.text).toContain('상태-레이아웃 매핑 런타임');
    expect(res.text).toContain('10분 퀵스타트');
    expect(res.text).not.toContain('State-Layout Mapping Runtime');
  });

  it('GET /search with lang=ko cookie renders Korean labels', async () => {
    const res = await request(app).get('/search').set('Cookie', 'lang=ko');

    expect(res.status).toBe(200);
    expect(res.text).toContain('검색');
    expect(res.text).toContain('StateSurface 기능과 개념 검색');
  });
});

describe('demo transitions', () => {
  it('guide-load streams correct NDJSON frames', async () => {
    const res = await request(app)
      .post('/transition/guide-load')
      .send({ slug: 'surface' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    // First frame: full state
    expect(lines[0].type).toBe('state');
    expect(lines[0].states).toHaveProperty('page:header');
    expect(lines[0].states).toHaveProperty('guide:toc');
    expect(lines[0].states).toHaveProperty('guide:content');

    // Second frame: partial content update
    expect(lines[1].type).toBe('state');
    expect(lines[1].full).toBe(false);
    expect(lines[1].changed).toContain('guide:content');
    expect(lines[1].states['guide:content'].sections.length).toBeGreaterThan(0);

    // Third frame: done
    expect(lines[2].type).toBe('done');
  });

  it('search streams correct NDJSON frames', async () => {
    const res = await request(app)
      .post('/transition/search')
      .send({ query: 'streaming' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    expect(lines[0].type).toBe('state');
    expect(lines[0].states).toHaveProperty('search:input');
    expect(lines[0].states).toHaveProperty('search:results');

    expect(lines[1].type).toBe('state');
    expect(lines[1].full).toBe(false);
    expect(lines[1].changed).toContain('search:results');
    expect(lines[1].states['search:results'].items.length).toBeGreaterThan(0);

    expect(lines[2].type).toBe('done');
  });

  it('stream-demo streams full sequence frames', async () => {
    const res = await request(app)
      .post('/transition/stream-demo')
      .send({ mode: 'full-sequence' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    // Full → partial(changed) → partial(removed) → full → done
    expect(lines[0].type).toBe('state');
    expect(lines[0].full).not.toBe(false);

    expect(lines[1].type).toBe('state');
    expect(lines[1].full).toBe(false);
    expect(lines[1].changed).toContain('demo:timeline');

    expect(lines[2].type).toBe('state');
    expect(lines[2].full).toBe(false);
    expect(lines[2].removed).toContain('demo:output');

    expect(lines[3].type).toBe('state');
    expect(lines[3].full).not.toBe(false);

    expect(lines[4].type).toBe('done');
  });

  it('switch-lang transition yields full frame with target language', async () => {
    const res = await request(app)
      .post('/transition/switch-lang')
      .send({ lang: 'ko', page: 'home' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    // Verify Set-Cookie header
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    expect(cookieStr).toContain('lang=ko');

    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    // Full frame with Korean content
    expect(lines[0].type).toBe('state');
    expect(lines[0].states['page:header'].lang).toBe('ko');
    expect(lines[0].states['page:hero'].badge).toContain('상태-레이아웃');

    expect(lines[1].type).toBe('done');
  });

  it('switch-lang to English yields English content', async () => {
    const res = await request(app)
      .post('/transition/switch-lang')
      .send({ lang: 'en', page: 'home' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    const cookieStr = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie'].join('; ')
      : res.headers['set-cookie'];
    expect(cookieStr).toContain('lang=en');

    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    expect(lines[0].states['page:header'].lang).toBe('en');
    expect(lines[0].states['page:hero'].badge).toBe('State-Layout Mapping Runtime');
  });

  it('action-demo streams correct NDJSON frames', async () => {
    const res = await request(app)
      .post('/transition/action-demo')
      .send({ type: 'button', variant: 'primary' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    expect(lines[0].type).toBe('state');
    expect(lines[0].states).toHaveProperty('actions:playground');
    expect(lines[0].states).toHaveProperty('actions:log');

    expect(lines[1].type).toBe('state');
    expect(lines[1].full).toBe(false);
    expect(lines[1].changed).toContain('actions:playground');

    expect(lines[2].type).toBe('done');
  });
});
