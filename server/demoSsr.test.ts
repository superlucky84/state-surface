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
    expect(res.text).toContain('<h-state name="page:recent-articles"');

    // SSR-filled content
    expect(res.text).toContain('State-driven UI for MPA pages');
    expect(res.text).toContain('data-ssr-hash');

    // __STATE__ script present
    expect(res.text).toContain('id="__STATE__"');
    expect(res.text).toContain('page:header');
    expect(res.text).toContain('page:hero');
    expect(res.text).toContain('page:recent-articles');
  });

  it('GET / keeps cross-page slots out of home surface', async () => {
    const res = await request(app).get('/');

    expect(res.text).not.toContain('name="page:content"');
    expect(res.text).not.toContain('name="panel:comments"');
    expect(res.text).not.toContain('name="search:input"');
    expect(res.text).not.toContain('name="search:results"');
  });
});

describe('demo transitions', () => {
  it('article-load streams correct NDJSON frames', async () => {
    const res = await request(app)
      .post('/transition/article-load')
      .send({ articleId: 1 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    const lines = res.text
      .trim()
      .split('\n')
      .map((l: string) => JSON.parse(l));

    // First frame: full state
    expect(lines[0].type).toBe('state');
    expect(lines[0].states).toHaveProperty('page:header');
    expect(lines[0].states).toHaveProperty('page:content');

    // Second frame: partial content update
    expect(lines[1].type).toBe('state');
    expect(lines[1].full).toBe(false);
    expect(lines[1].changed).toContain('page:content');

    // Third frame: partial comments
    expect(lines[2].type).toBe('state');
    expect(lines[2].full).toBe(false);
    expect(lines[2].changed).toContain('panel:comments');

    // Fourth frame: done
    expect(lines[3].type).toBe('done');
  });

  it('search streams correct NDJSON frames', async () => {
    const res = await request(app)
      .post('/transition/search')
      .send({ query: 'lithent' })
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
    expect(lines[1].states['search:results'].items.length).toBe(3);

    expect(lines[2].type).toBe('done');
  });
});
