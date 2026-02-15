import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './index.js';

describe('multi-route SSR', () => {
  it('GET / returns SSR-rendered home page', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="page:hero"');
    expect(res.text).toContain('<h-state name="page:recent-articles"');
    expect(res.text).toContain('State-driven UI for MPA pages');
    expect(res.text).toContain('id="__STATE__"');
    expect(res.text).toContain('data-ssr-hash');
  });

  it('GET /search returns SSR-rendered search page', async () => {
    const res = await request(app).get('/search');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="search:input"');
    expect(res.text).toContain('<h-state name="search:results"');
    expect(res.text).toContain('id="__STATE__"');
    expect(res.text).toContain('Search');
  });

  it('GET /article/1 returns SSR-rendered article page', async () => {
    const res = await request(app).get('/article/1');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="page:content"');
    expect(res.text).toContain('id="__STATE__"');
  });

  it('GET /article/42 uses dynamic param in initial state', async () => {
    const res = await request(app).get('/article/42');

    expect(res.status).toBe(200);
    // __STATE__ should contain articleId: 42
    const stateMatch = res.text.match(
      /<script id="__STATE__" type="application\/json">([\s\S]*?)<\/script>/
    );
    expect(stateMatch).not.toBeNull();
    const state = JSON.parse(stateMatch![1]);
    expect(state['page:content'].articleId).toBe(42);
  });
});

describe('boot config injection', () => {
  it('GET /article/1 includes __BOOT__ script', async () => {
    const res = await request(app).get('/article/1');

    expect(res.text).toContain('id="__BOOT__"');
    const bootMatch = res.text.match(
      /<script id="__BOOT__" type="application\/json">([\s\S]*?)<\/script>/
    );
    expect(bootMatch).not.toBeNull();
    const boot = JSON.parse(bootMatch![1]);
    expect(boot.transition).toBe('article-load');
    expect(boot.params.articleId).toBe(1);
  });

  it('GET / does not include __BOOT__ script (no boot config)', async () => {
    const res = await request(app).get('/');

    expect(res.text).not.toContain('id="__BOOT__"');
  });

  it('GET /search does not include __BOOT__ script', async () => {
    const res = await request(app).get('/search');

    expect(res.text).not.toContain('id="__BOOT__"');
  });
});

describe('empty anchors', () => {
  it('GET / includes only home-specific slots', async () => {
    const res = await request(app).get('/');

    expect(res.text).toContain('name="page:hero"');
    expect(res.text).toContain('name="page:recent-articles"');
    expect(res.text).not.toContain('name="page:content"');
    expect(res.text).not.toContain('name="panel:comments"');
    expect(res.text).not.toContain('name="search:input"');
    expect(res.text).not.toContain('name="search:results"');
  });

  it('GET /search leaves search:results empty initially', async () => {
    const res = await request(app).get('/search');

    // search:results has no initial state
    expect(res.text).toMatch(/<h-state name="search:results"><\/h-state>/);
  });
});
