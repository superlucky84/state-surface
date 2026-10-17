import { afterEach, describe, expect, it } from 'vitest';
import { h } from 'lithent';
import { renderToString } from 'lithent/ssr';
import {
  Image,
  Picture,
  allowedRemote,
  configureImages,
  getImage,
  readImagePreload,
  type ImageAsset,
} from './image.js';
import { setBasePath } from './basePath.js';
import { renderPage } from '../server/ssrRenderer.js';
import type { SurfaceContext } from '../server/core/context.js';

const hero: ImageAsset = {
  src: '/assets/hero-abc.png',
  width: 1600,
  height: 900,
  format: 'png',
  variants: {
    webp: [640, 750, 828, 1080, 1280, 1600].map(w => [w, `/assets/hero-abc-${w}.webp`]),
    avif: [640, 1600].map(w => [w, `/assets/hero-abc-${w}.avif`]),
    png: [640, 1600].map(w => [w, `/assets/hero-abc-${w}.png`]),
  },
};
const html = (node: unknown) => renderToString(node as never);
const attrs = (node: unknown) => (node as { props: Record<string, unknown> }).props;

afterEach(() => {
  configureImages({});
  setBasePath('');
});

describe('<Image> (DC-26)', () => {
  it('writes WebP srcset up to twice the width, sizes, the size and lazy loading', () => {
    const node = Image({ src: hero, alt: 'Diagram', width: 600 });
    expect(attrs(node)).toEqual({
      src: '/assets/hero-abc-640.webp',
      srcset: [640, 750, 828, 1080, 1280].map(w => `/assets/hero-abc-${w}.webp ${w}w`).join(', '),
      sizes: '(min-width: 600px) 600px, 100vw',
      alt: 'Diagram',
      width: 600,
      height: 338,
      loading: 'lazy',
      decoding: 'async',
      style: 'max-width:100%;height:auto',
    });
    expect(readImagePreload(node)).toBeUndefined();
  });

  it('uses the original size by default and keeps extra attributes', () => {
    const node = Image({ src: hero, alt: '', class: 'hero', id: 'h' });
    expect(attrs(node)).toMatchObject({
      width: 1600,
      height: 900,
      class: 'hero',
      id: 'h',
      alt: '',
    });
    expect(attrs(node).src).toBe('/assets/hero-abc-1600.webp');
  });

  it('marks priority images for a preload and loads them eagerly', () => {
    const node = Image({ src: hero, alt: 'x', width: 800, priority: true });
    expect(attrs(node)).toMatchObject({ loading: 'eager', fetchpriority: 'high' });
    expect(readImagePreload(node)).toEqual({
      href: '/assets/hero-abc-828.webp',
      srcset: attrs(node).srcset,
      sizes: '(min-width: 800px) 800px, 100vw',
      type: 'image/webp',
    });
  });

  it.each([
    ['full-width', { sizes: '100vw', style: 'width:100%;height:auto' }],
    ['fixed', { srcset: '/assets/hero-abc-640.webp 1x, /assets/hero-abc-1280.webp 2x' }],
  ] as const)('layout %s', (layout, expected) => {
    const node = Image({ src: hero, alt: 'x', width: 600, layout });
    expect(attrs(node)).toMatchObject(expected);
    if (layout === 'full-width') expect(attrs(node).srcset).toContain('1600w');
    if (layout === 'fixed') expect(attrs(node)).not.toHaveProperty('sizes');
  });

  it('lets pages override sizes', () => {
    expect(attrs(Image({ src: hero, alt: 'x', sizes: '50vw' })).sizes).toBe('50vw');
  });

  it('requires alt and an imported image or URL', () => {
    expect(() => Image({ src: hero } as never)).toThrow('alt is required');
    expect(() => Image({ src: '/local.png', alt: 'x' })).toThrow('must be an imported image');
  });
});

describe('remote images', () => {
  const remote = {
    src: 'https://images.example.com/photos/a.jpg',
    alt: 'A',
    width: 400,
    height: 300,
  };

  it('need an allowed host and their size', () => {
    expect(() => Image(remote)).toThrow('images.example.com is not in images.remotePatterns');
    configureImages({ remotePatterns: [{ hostname: '*.example.com' }] });
    expect(() => Image({ ...remote, height: undefined })).toThrow('need width and height');
  });

  it('resize through /_surface/image at the configured widths (with BASE_PATH)', () => {
    configureImages({ remotePatterns: [{ hostname: 'images.example.com' }] });
    setBasePath('/demo');
    const node = Image(remote);
    const url = (w: number) =>
      `/demo/_surface/image?url=${encodeURIComponent(remote.src)}&w=${w}&f=webp`;
    expect(attrs(node)).toMatchObject({
      src: url(640),
      srcset: `${url(640)} 640w, ${url(750)} 750w, ${url(828)} 828w`,
      width: 400,
      height: 300,
    });
    expect(html(node)).toContain('&amp;w=640&amp;f=webp');
  });

  it('use the original URL on Workers, or Cloudflare Images when configured', () => {
    configureImages({
      remotePatterns: [{ hostname: 'images.example.com' }],
      remote: 'passthrough',
    });
    expect(attrs(Image(remote))).toMatchObject({ src: remote.src, width: 400 });
    expect(attrs(Image(remote))).not.toHaveProperty('srcset');
    configureImages({ remotePatterns: [{ hostname: 'images.example.com' }], remote: 'cloudflare' });
    expect(attrs(Image(remote)).src).toBe(`/cdn-cgi/image/width=640,format=webp/${remote.src}`);
  });

  it.each([
    ['https://images.example.com/a.png', [{ hostname: 'images.example.com' }], true],
    ['http://images.example.com/a.png', [{ hostname: 'images.example.com' }], false],
    [
      'http://images.example.com/a.png',
      [{ protocol: 'http', hostname: 'images.example.com' }],
      true,
    ],
    ['https://a.cdn.example.com/x', [{ hostname: '*.example.com' }], false],
    ['https://a.cdn.example.com/x', [{ hostname: '**.example.com' }], true],
    ['https://cdn.example.com/x', [{ hostname: '*.example.com' }], true],
    ['https://example.com.evil.test/x', [{ hostname: 'example.com' }], false],
    [
      'https://cdn.example.com/u/1/a.png',
      [{ hostname: 'cdn.example.com', pathname: '/u/*/a.png' }],
      true,
    ],
    [
      'https://cdn.example.com/u/1/2/a.png',
      [{ hostname: 'cdn.example.com', pathname: '/u/*/a.png' }],
      false,
    ],
    ['https://cdn.example.com:8443/a', [{ hostname: 'cdn.example.com', port: '443' }], false],
    ['https://user:pw@cdn.example.com/a', [{ hostname: 'cdn.example.com' }], false],
    ['javascript:alert(1)', [{ hostname: 'cdn.example.com' }], false],
  ] as const)('allowedRemote(%s)', (url, patterns, expected) => {
    expect(allowedRemote(url, patterns as never)).toBe(expected);
  });
});

describe('<Picture> and getImage()', () => {
  it('writes a source per format and the original format in <img>', () => {
    configureImages({ formats: ['avif'] });
    const out = html(Picture({ src: hero, alt: 'x', width: 600, formats: ['avif', 'webp'] }));
    expect(out).toMatch(
      /^<picture><source type="image\/avif" srcset="\/assets\/hero-abc-640\.avif 640w, \/assets\/hero-abc-1600\.avif 1600w" sizes="[^"]+" \/><source type="image\/webp" srcset="[^"]+"/
    );
    expect(out).toContain(
      '<img src="/assets/hero-abc-640.png" srcset="/assets/hero-abc-640.png 640w, /assets/hero-abc-1600.png 1600w"'
    );
  });

  it('refuses formats the build does not generate', () => {
    expect(() => Picture({ src: hero, alt: 'x', formats: ['avif'] })).toThrow(
      'format "avif" is not generated'
    );
  });

  it('gives URLs for CSS backgrounds', () => {
    expect(getImage(hero, { width: 300, layout: 'fixed' })).toEqual({
      src: '/assets/hero-abc-640.webp',
      srcset: '/assets/hero-abc-640.webp 1x',
      sizes: undefined,
      width: 300,
      height: 169,
      type: 'image/webp',
    });
  });
});

describe('priority preloads in the document head', () => {
  it('render once per image with the stylesheets', async () => {
    const page = {
      default: () =>
        h(
          'html',
          {},
          h('head', {}, h('title', {}, 'T')),
          h(
            'body',
            {},
            h(Image as never, { src: hero, alt: 'a', width: 800, priority: true } as never),
            h(Image as never, { src: hero, alt: 'b', width: 800, priority: true } as never),
            h(Image as never, { src: hero, alt: 'c', width: 400 } as never)
          )
        ),
    };
    const ctx = { route: { pattern: '/', prerendered: false }, basePath: '', nonce: '' };
    const out = await renderPage(page as never, ctx as unknown as SurfaceContext, {
      tags: () => ({ styles: ['/assets/app.css'], preload: [] }),
    });
    const head = out.slice(0, out.indexOf('</head>'));
    expect(head.match(/rel="preload" as="image"/g)).toHaveLength(1);
    expect(head).toMatch(
      /<link rel="stylesheet" href="\/assets\/app\.css" data-ss><link rel="preload" as="image" href="\/assets\/hero-abc-828\.webp" imagesrcset="[^"]+" imagesizes="\(min-width: 800px\) 800px, 100vw" type="image\/webp" fetchpriority="high" data-ss>/
    );
  });
});
