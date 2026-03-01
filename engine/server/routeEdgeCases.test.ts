import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './index.js';

let app: any;
beforeAll(async () => {
  ({ app } = await createApp());
});

describe('dynamic param validation', () => {
  it('GET /guide/surface works with valid slug', async () => {
    const res = await request(app).get('/guide/surface');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
  });

  it('GET /guide/template works with valid slug', async () => {
    const res = await request(app).get('/guide/template');

    expect(res.status).toBe(200);
  });

  it('GET /guide/nonexistent returns 500 for invalid slug', async () => {
    const res = await request(app).get('/guide/nonexistent');

    expect(res.status).toBe(500);
    expect(res.text).toContain('Invalid guide slug');
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
  it('GET / includes navigation links to other routes', async () => {
    const res = await request(app).get('/');

    // Header template includes nav links
    expect(res.text).toContain('href="/"');
    expect(res.text).toContain('href="/guide/surface"');
    expect(res.text).toContain('href="/features/streaming"');
    expect(res.text).toContain('href="/features/actions"');
    expect(res.text).toContain('href="/search"');
  });

  it('GET /search includes same navigation links', async () => {
    const res = await request(app).get('/search');

    expect(res.text).toContain('href="/"');
    expect(res.text).toContain('href="/search"');
  });
});

describe('all routes render valid HTML', () => {
  const routes = ['/', '/search', '/guide/surface', '/features/streaming', '/features/actions'];

  for (const route of routes) {
    it(`GET ${route} returns valid HTML document`, async () => {
      const res = await request(app).get(route);

      expect(res.status).toBe(200);
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('<html');
      expect(res.text).toContain('</html>');
      expect(res.text).toContain('<script type="module" src="/engine/client/main.ts">');
    });
  }
});
