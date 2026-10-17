import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prerender } from './prerender.js';
import { SurfaceBuildError } from './diagnostics.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const bundle = (name = 'bundle') => path.join(here, `__fixtures__/prerender/${name}.ts`);
const options = (clientDir: string) => ({
  root,
  // The fixture lives under engine/: only the server engine counts as engine frames here.
  engineDir: path.join(root, 'engine/server'),
  clientDir,
});

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('prerender build output (DC-24 ④)', () => {
  it('writes <path>/index.html for static routes and every getStaticPaths entry', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'surface-prerender-'));
    const pages = await prerender(bundle(), options(dir));
    expect(pages.map(page => page.path)).toEqual(['/static', '/docs/a', '/docs/b c']);
    expect(await readFile(path.join(dir, 'static/index.html'), 'utf8')).toContain(
      '<h1>static</h1>'
    );
    expect(await readFile(path.join(dir, 'docs/b c/index.html'), 'utf8')).toContain('<h1>b c</h1>');
  });

  it('also writes the language-less path as the default language with a canonical link', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'surface-prerender-'));
    const pages = await prerender(bundle('bundle-i18n'), options(dir));
    expect(pages.map(page => page.path)).toEqual(['/en', '/', '/ko']);
    const en = await readFile(path.join(dir, 'en/index.html'), 'utf8');
    const neutral = await readFile(path.join(dir, 'index.html'), 'utf8');
    expect(en).toContain('hreflang="ko" href="https://docs.example/ko"');
    expect(en).not.toContain('rel="canonical"');
    expect(neutral).toBe(
      en.replace(
        '<!--/ss:head-->',
        '<link rel="canonical" href="https://docs.example/en" data-ss><!--/ss:head-->'
      )
    );
  });

  it('reports a request-dependent read at its source line', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'surface-prerender-'));
    const error = await prerender(bundle('bundle-secret'), options(dir)).catch(error => error);
    expect(error).toBeInstanceOf(SurfaceBuildError);
    expect(error.message).toContain('engine/build/__fixtures__/prerender/pages/secret.ts:7:');
    expect(error.message).toContain('ctx.cookies is not available while prerendering /secret');
    expect(error.frame).toContain("ctx.cookies.get('lang')");
  });

  it('rejects getStaticPaths params that are not single path segments', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'surface-prerender-'));
    await expect(prerender(bundle('bundle-bad'), options(dir))).rejects.toThrow(
      'getStaticPaths()[0].slug must be a non-empty string without "/"'
    );
  });
});
