import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './index.js';

let app: any;
beforeAll(async () => {
  ({ app } = await createApp());
});

describe('multi-route SSR', () => {
  it('GET / returns SSR-rendered home page', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="page:hero"');
    expect(res.text).toContain('<h-state name="page:concepts"');
    expect(res.text).toContain('<h-state name="page:features"');
    expect(res.text).toContain('StateSurface');
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

  it('GET /guide/surface returns SSR-rendered guide page', async () => {
    const res = await request(app).get('/guide/surface');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="guide:content"');
    expect(res.text).toContain('<h-state name="guide:toc"');
    expect(res.text).toContain('id="__STATE__"');
  });

  it('GET /features/streaming returns SSR-rendered streaming page', async () => {
    const res = await request(app).get('/features/streaming');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<h-state name="demo:controls"');
    expect(res.text).toContain('<h-state name="demo:timeline"');
    expect(res.text).toContain('<h-state name="demo:output"');
    expect(res.text).toContain('id="__STATE__"');
  });

  it('GET /features/actions returns SSR-rendered actions page', async () => {
    const res = await request(app).get('/features/actions');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<h-state name="actions:playground"');
    expect(res.text).toContain('<h-state name="actions:log"');
    expect(res.text).toContain('id="__STATE__"');
  });
});

describe('boot config injection', () => {
  it('GET /guide/surface includes __BOOT__ script', async () => {
    const res = await request(app).get('/guide/surface');

    expect(res.text).toContain('id="__BOOT__"');
    const bootMatch = res.text.match(
      /<script id="__BOOT__" type="application\/json">([\s\S]*?)<\/script>/
    );
    expect(bootMatch).not.toBeNull();
    const boot = JSON.parse(bootMatch![1]);
    expect(boot.transition).toBe('guide-load');
    expect(boot.params.slug).toBe('surface');
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
    expect(res.text).toContain('name="page:concepts"');
    expect(res.text).toContain('name="page:features"');
    expect(res.text).not.toContain('name="guide:content"');
    expect(res.text).not.toContain('name="demo:controls"');
    expect(res.text).not.toContain('name="search:input"');
    expect(res.text).not.toContain('name="search:results"');
  });

  it('GET /search leaves search:results empty initially', async () => {
    const res = await request(app).get('/search');

    // search:results has no initial state
    expect(res.text).toMatch(/<h-state name="search:results"[^>]*><\/h-state>/);
  });
});
