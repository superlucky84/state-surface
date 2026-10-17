import { afterEach, describe, expect, it } from 'vitest';
import { h } from 'lithent';
import { createHandler } from './core/handler.js';
import { defineManifest } from './core/manifest.js';
import { setBasePath } from '../shared/basePath.js';

const doc = (...body: unknown[]) =>
  h('html', {}, h('head', {}, h('title', {}, 'T')), h('body', {}, ...(body as never[])));

afterEach(() => setBasePath(''));

describe('page styles (DC-23)', () => {
  it('link after the global styles with BASE_PATH, on engine-less pages too', async () => {
    setBasePath('/demo');
    const handler = createHandler({
      development: false,
      secret: 's'.repeat(32),
      manifest: defineManifest({
        basePath: '/demo',
        routes: [
          {
            pattern: '/styled',
            module: { default: () => doc(h('p', {}, 'static')) },
            page: {
              id: 'styled',
              slots: {},
              styles: ['/assets/page-styled-1.css', '/assets/app.css'],
            },
          },
          {
            pattern: '/action',
            module: { default: () => doc(h('button', { 'data-action': 'go' }, 'Go')) },
            page: { id: 'action', slots: {}, styles: ['/assets/page-action-1.css'] },
          },
          { pattern: '/plain', module: { default: () => doc(h('p', {}, 'plain')) } },
        ],
        transitions: {},
        document: {
          styles: ['/assets/app.css'],
          engine: { loader: '/assets/loader.js', runtime: '/assets/runtime.js', bridge: '/b.js' },
        },
      }),
    });
    const links = async (path: string) => {
      const html = await (await handler.fetch(new Request('https://site.test/demo' + path))).text();
      return [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
    };
    expect(await links('/styled')).toEqual([
      '/demo/assets/app.css',
      '/demo/assets/page-styled-1.css',
    ]);
    expect(await links('/action')).toEqual([
      '/demo/assets/app.css',
      '/demo/assets/page-action-1.css',
    ]);
    expect(await links('/plain')).toEqual(['/demo/assets/app.css']);
  });
});
