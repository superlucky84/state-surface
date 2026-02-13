import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './index.js';

describe('static page (no transition, no __STATE__)', () => {
  it('GET /about renders without __STATE__', async () => {
    const res = await request(app).get('/about');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('About StateSurface');
    expect(res.text).not.toContain('id="__STATE__"');
    expect(res.text).not.toContain('id="__BOOT__"');
  });

  it('GET /about leaves all anchors empty', async () => {
    const res = await request(app).get('/about');

    expect(res.text).toMatch(/<h-state name="page:header"><\/h-state>/);
    expect(res.text).toMatch(/<h-state name="system:error"><\/h-state>/);
  });
});

describe('dynamic param validation', () => {
  it('GET /article/1 works with valid numeric id', async () => {
    const res = await request(app).get('/article/1');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
  });

  it('GET /article/abc returns 500 for non-numeric id', async () => {
    const res = await request(app).get('/article/abc');

    expect(res.status).toBe(500);
    expect(res.text).toContain('Invalid article id');
  });

  it('GET /article/0 returns 500 for zero id', async () => {
    const res = await request(app).get('/article/0');

    expect(res.status).toBe(500);
    expect(res.text).toContain('Invalid article id');
  });

  it('GET /article/-1 returns 500 for negative id', async () => {
    const res = await request(app).get('/article/-1');

    expect(res.status).toBe(500);
    expect(res.text).toContain('Invalid article id');
  });
});

describe('404 handling', () => {
  it('GET /nonexistent returns 404', async () => {
    const res = await request(app).get('/nonexistent');

    expect(res.status).toBe(404);
    expect(res.text).toContain('Not Found');
  });

  it('GET /article returns 404 (no index.ts in article/)', async () => {
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
    expect(res.text).toContain('href="/article/1"');
    expect(res.text).toContain('href="/search"');
    expect(res.text).toContain('href="/about"');
  });

  it('GET /search includes same navigation links', async () => {
    const res = await request(app).get('/search');

    expect(res.text).toContain('href="/"');
    expect(res.text).toContain('href="/search"');
  });
});

describe('all routes render valid HTML', () => {
  const routes = ['/', '/search', '/article/1', '/about'];

  for (const route of routes) {
    it(`GET ${route} returns valid HTML document`, async () => {
      const res = await request(app).get(route);

      expect(res.status).toBe(200);
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('<html');
      expect(res.text).toContain('</html>');
      expect(res.text).toContain('<script type="module" src="/client/main.ts">');
    });
  }
});
