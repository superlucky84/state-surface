import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileToUrlPattern, isPageFile, scanRoutes } from './routeScanner.js';

describe('fileToUrlPattern', () => {
  it('converts index.tsx to /', () => {
    expect(fileToUrlPattern('index.tsx')).toBe('/');
  });

  it('converts static file to /name', () => {
    expect(fileToUrlPattern('search.tsx')).toBe('/search');
  });

  it('converts [param].tsx to /:param', () => {
    expect(fileToUrlPattern('guide/[slug].tsx')).toBe('/guide/:slug');
  });

  it('converts nested index.tsx to /dir', () => {
    expect(fileToUrlPattern('admin/index.tsx')).toBe('/admin');
  });

  it('converts deeply nested dynamic segment', () => {
    expect(fileToUrlPattern('admin/users/[userId].tsx')).toBe('/admin/users/:userId');
  });
});

describe('isPageFile', () => {
  it('accepts .tsx files outside _ folders', () => {
    expect(isPageFile('index.tsx')).toBe(true);
    expect(isPageFile('examples/chat.tsx')).toBe(true);
  });

  it('skips _-prefixed files and folders, plain .ts modules and tests', () => {
    expect(isPageFile('guide/_components/Toc.tsx')).toBe(false);
    expect(isPageFile('_shared/components/pageHeader.tsx')).toBe(false);
    expect(isPageFile('_draft.tsx')).toBe(false);
    expect(isPageFile('search/transitions/search.ts')).toBe(false);
    expect(isPageFile('chat/chat.test.tsx')).toBe(false);
  });
});

describe('scanRoutes', () => {
  const routesDir = path.resolve(process.cwd(), 'routes');

  it('discovers demo pages from routes/', async () => {
    const routes = await scanRoutes(routesDir);
    const patterns = routes.map(r => r.urlPattern);

    expect(patterns).toEqual([
      '/',
      '/examples',
      '/examples/actions',
      '/examples/chat',
      '/examples/search',
      '/examples/streaming',
      '/examples/ui-patch',
      '/examples/view-transition',
      '/guide/:slug',
    ]);
    for (const route of routes) expect(route.filePath).toMatch(/\.tsx$/);
  });

  it('reports two files that map to the same URL', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'surface-routes-'));
    try {
      await mkdir(path.join(dir, 'routes/about'), { recursive: true });
      await writeFile(path.join(dir, 'routes/about.tsx'), 'export default () => null;');
      await writeFile(path.join(dir, 'routes/about/index.tsx'), 'export default () => null;');
      await expect(scanRoutes(path.join(dir, 'routes'))).rejects.toThrow(
        /routes\/about\.tsx and routes\/about\/index\.tsx both map to "\/about"/
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns empty array for nonexistent directory', async () => {
    const routes = await scanRoutes('/nonexistent/dir');
    expect(routes).toEqual([]);
  });
});
