import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileToUrlPattern, scanRoutes } from './routeScanner.js';

describe('fileToUrlPattern', () => {
  it('converts index.ts to /', () => {
    expect(fileToUrlPattern('index.ts')).toBe('/');
  });

  it('converts static file to /name', () => {
    expect(fileToUrlPattern('search.ts')).toBe('/search');
  });

  it('converts [param].ts to /:param', () => {
    expect(fileToUrlPattern('guide/[slug].ts')).toBe('/guide/:slug');
  });

  it('converts nested index.ts to /dir', () => {
    expect(fileToUrlPattern('admin/index.ts')).toBe('/admin');
  });

  it('converts deeply nested dynamic segment', () => {
    expect(fileToUrlPattern('admin/users/[userId].ts')).toBe('/admin/users/:userId');
  });

  it('converts nested static route', () => {
    expect(fileToUrlPattern('features/streaming.ts')).toBe('/features/streaming');
  });
});

describe('scanRoutes', () => {
  const routesDir = path.resolve(import.meta.dirname ?? process.cwd(), '..', '..', 'routes');

  it('discovers route modules from routes/ directory', async () => {
    const routes = await scanRoutes(routesDir);
    const patterns = routes.map(r => r.urlPattern);

    expect(patterns).toContain('/');
    expect(patterns).toContain('/search');
    expect(patterns).toContain('/guide/:slug');
    expect(patterns).toContain('/features/streaming');
    expect(patterns).toContain('/features/actions');
  });

  it('skips template files (.tsx)', async () => {
    const routes = await scanRoutes(routesDir);
    const files = routes.map(r => r.filePath);

    for (const file of files) {
      expect(file).not.toMatch(/\.tsx$/);
    }
  });

  it('skips files inside templates/ and transitions/ directories', async () => {
    const routes = await scanRoutes(routesDir);
    const files = routes.map(r => r.filePath);

    for (const file of files) {
      expect(file).not.toMatch(/\/templates\//);
      expect(file).not.toMatch(/\/transitions\//);
    }
  });

  it('skips _shared/ directory', async () => {
    const routes = await scanRoutes(routesDir);
    const files = routes.map(r => r.filePath);

    for (const file of files) {
      expect(file).not.toMatch(/_shared/);
    }
  });

  it('sorts static routes before dynamic routes', async () => {
    const routes = await scanRoutes(routesDir);
    const patterns = routes.map(r => r.urlPattern);

    const firstDynamic = patterns.findIndex(p => p.includes(':'));
    const lastStatic = patterns.findLastIndex(p => !p.includes(':'));

    if (firstDynamic >= 0 && lastStatic >= 0) {
      expect(lastStatic).toBeLessThan(firstDynamic);
    }
  });

  it('returns empty array for nonexistent directory', async () => {
    const routes = await scanRoutes('/nonexistent/dir');
    expect(routes).toEqual([]);
  });
});
