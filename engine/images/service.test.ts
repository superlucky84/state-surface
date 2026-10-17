import { createServer, type Server } from 'node:http';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createImageService } from './service.js';
import { checkImageOptions, imageConfig, imageModule, materializeImages } from '../build/images.js';
import { createHandler } from '../server/core/handler.js';
import { defineManifest } from '../server/core/manifest.js';
import type { ImageService } from '../server/core/imageEndpoint.js';
import type { ImageAsset } from '../shared/image.js';

let dir: string;
let png: Buffer;
let server: Server;
let origin: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'surface-images-'));
  png = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: '#4f46e5' },
  })
    .png()
    .toBuffer();
  await writeFile(path.join(dir, 'photo.png'), png);
  // A remote image host: an image, a redirect, HTML and an oversized image.
  server = createServer((request, response) => {
    if (request.url === '/a.png') response.writeHead(200, { 'content-type': 'image/png' }).end(png);
    else if (request.url === '/moved')
      response.writeHead(302, { location: 'http://169.254.169.254/' }).end();
    else if (request.url === '/page')
      response.writeHead(200, { 'content-type': 'text/html' }).end('<p>hi</p>');
    else response.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const size = async (body: Uint8Array) => sharp(body).metadata();

describe('image service (DC-26)', () => {
  it('resizes project files and caches the result on disk', async () => {
    const cacheDir = path.join(dir, 'cache-local');
    const service = createImageService({ root: dir, cacheDir });
    const first = await service.transform({ file: '/photo.png' }, 640, 'webp');
    expect(first.type).toBe('image/webp');
    expect(await size(first.body)).toMatchObject({ format: 'webp', width: 640, height: 320 });
    expect(await readdir(cacheDir)).toHaveLength(1);
    const again = await service.transform({ file: '/photo.png' }, 640, 'webp');
    expect(Buffer.from(again.body).equals(Buffer.from(first.body))).toBe(true);
    // Never enlarged.
    expect(
      await size((await service.transform({ file: '/photo.png' }, 2048, 'avif')).body)
    ).toMatchObject({
      width: 1200,
    });
    await expect(service.transform({ file: '/../etc/passwd' }, 640, 'webp')).rejects.toThrow();
    await expect(service.transform({ file: '/missing.png' }, 640, 'webp')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('downloads remote images without following redirects or accepting other content', async () => {
    const service = createImageService({
      cacheDir: path.join(dir, 'cache-remote'),
      maxBytes: png.length + 10,
    });
    const ok = await service.transform({ url: `${origin}/a.png` }, 640, 'webp');
    expect(await size(ok.body)).toMatchObject({ width: 640 });
    await expect(service.transform({ url: `${origin}/moved` }, 640, 'webp')).rejects.toMatchObject({
      status: 502,
    });
    await expect(service.transform({ url: `${origin}/page` }, 640, 'webp')).rejects.toThrow(
      'not an image'
    );
    const small = createImageService({ cacheDir: path.join(dir, 'cache-small'), maxBytes: 100 });
    await expect(small.transform({ url: `${origin}/a.png` }, 640, 'webp')).rejects.toThrow(
      'too large'
    );
  });
});

describe('/_surface/image endpoint', () => {
  const calls: unknown[] = [];
  const service: ImageService = {
    async transform(source, width, format) {
      calls.push([source, width, format]);
      return { body: new Uint8Array([1, 2, 3]), type: `image/${format}` };
    },
  };
  const handler = (options: { development?: boolean; images?: ImageService | null } = {}) =>
    createHandler({
      development: options.development ?? false,
      ...(options.images === null ? {} : { images: options.images ?? service }),
      manifest: defineManifest({
        routes: [],
        transitions: {},
        images: {
          widths: [640, 1080],
          formats: ['webp'],
          remotePatterns: [{ hostname: 'cdn.example.com' }],
        },
      }),
    });
  const get = (path: string, options?: Parameters<typeof handler>[0]) =>
    handler(options).fetch(new Request('https://site.test' + path));
  const remote = encodeURIComponent('https://cdn.example.com/a.jpg');

  it('serves allowed remote images at configured widths with cache headers', async () => {
    const response = await get(`/_surface/image?url=${remote}&w=640&f=webp`);
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
      'x-content-type-options': 'nosniff',
    });
    expect(calls.at(-1)).toEqual([{ url: 'https://cdn.example.com/a.jpg' }, 640, 'webp']);
  });

  it.each([
    [`/_surface/image?url=${encodeURIComponent('https://evil.test/a.jpg')}&w=640&f=webp`, 403],
    [`/_surface/image?url=${remote}&w=700&f=webp`, 400],
    [`/_surface/image?url=${remote}&w=640&f=avif`, 400],
    [`/_surface/image?url=${remote}&w=640&f=gif`, 400],
    [`/_surface/image?url=${remote}&w=0&f=webp`, 400],
    ['/_surface/image?w=640&f=webp', 400],
    // Local files only in dev (builds write imported images as static files).
    ['/_surface/image?src=%2Fphoto.png&w=640&f=webp', 400],
  ])('rejects %s with %i', async (path, status) => {
    expect((await get(path)).status).toBe(status);
  });

  it('serves local files in dev and answers 404 without a service (Workers)', async () => {
    const dev = await get('/_surface/image?src=%2Froutes%2Fa.png&w=333&f=webp', {
      development: true,
    });
    expect([dev.status, dev.headers.get('cache-control')]).toEqual([200, 'no-cache']);
    expect(
      (await get('/_surface/image?src=%2F..%2Fsecret.png&w=333&f=webp', { development: true }))
        .status
    ).toBe(400);
    expect(
      (await get('/_surface/image?src=%2Fpackage.json&w=333&f=webp', { development: true })).status
    ).toBe(400);
    expect((await get(`/_surface/image?url=${remote}&w=640&f=webp`, { images: null })).status).toBe(
      404
    );
  });

  it('maps transform failures to 502', async () => {
    const failing: ImageService = {
      transform: async () => {
        throw new Error('boom');
      },
    };
    expect(
      (await get(`/_surface/image?url=${remote}&w=640&f=webp`, { images: failing })).status
    ).toBe(502);
  });
});

describe('build: imported images and prerendered remote images', () => {
  it('write every width and format with hashed names, or point dev at the endpoint', async () => {
    const file = path.join(dir, 'routes', 'photo.png');
    await writeFile(path.join(dir, 'photo-copy.png'), png);
    await import('node:fs/promises').then(fs => fs.mkdir(path.dirname(file), { recursive: true }));
    await writeFile(file, png);
    const context = {
      root: dir,
      base: '/demo',
      clientDir: path.join(dir, 'dist/client'),
      cacheDir: path.join(dir, 'cache-build'),
      config: imageConfig(
        { widths: [640, 1080, 2048], formats: ['avif'] },
        { adapter: 'node', prerender: false }
      ),
    };
    const asset = (code: string) =>
      JSON.parse(code.replace(/^export default |;$/g, '')) as ImageAsset;
    const built = asset(await imageModule(file, { ...context, command: 'build' }));
    expect(built).toMatchObject({ width: 1200, height: 600, format: 'png' });
    expect(built.src).toMatch(/^\/demo\/assets\/photo-[0-9a-f]{10}\.png$/);
    expect(Object.keys(built.variants)).toEqual(['webp', 'avif', 'png']);
    expect(built.variants.webp!.map(([w]) => w)).toEqual([640, 1080, 1200]);
    for (const [width, url] of built.variants.avif!) {
      const output = await readFile(path.join(context.clientDir, url.replace('/demo/', '')));
      expect(await size(output)).toMatchObject({ format: 'heif', width });
    }
    const dev = asset(await imageModule(file, { ...context, command: 'serve' }));
    expect(dev.src).toBe('/demo/routes/photo.png');
    expect(dev.variants.webp![0]).toEqual([
      640,
      '/demo/_surface/image?src=%2Froutes%2Fphoto.png&w=640&f=webp',
    ]);
  });

  it('turn endpoint URLs in prerendered HTML into static assets', async () => {
    const service: ImageService = {
      transform: async (_source, width) => ({
        body: new Uint8Array([width % 256]),
        type: 'image/webp',
      }),
    };
    const clientDir = path.join(dir, 'prerender');
    const url = (w: number) =>
      `/demo/_surface/image?url=${encodeURIComponent('https://cdn.example.com/a.jpg')}&amp;w=${w}&amp;f=webp`;
    const html = `<link rel="preload" as="image" href="${url(640)}" imagesrcset="${url(640)} 640w, ${url(1080)} 1080w"><img src="${url(640)}" srcset="${url(640)} 640w, ${url(1080)} 1080w">`;
    const done = new Map<string, string>();
    const output = await materializeImages(html, { base: '/demo', clientDir, service, done });
    expect(output).not.toContain('_surface/image');
    const files = output.match(/\/demo\/assets\/remote-[0-9a-f]{16}-\d+\.webp/g)!;
    expect(new Set(files).size).toBe(2);
    expect(done.size).toBe(2);
    expect([...(await readFile(path.join(clientDir, files[0].slice('/demo/'.length))))]).toEqual([
      128,
    ]);
  });

  it('validate the plugin options and pick the remote mode per runtime', () => {
    expect(() => checkImageOptions({ widths: [10] })).toThrow('images.widths');
    expect(() => checkImageOptions({ formats: ['gif' as never] })).toThrow('images.formats');
    expect(() => checkImageOptions({ remotePatterns: [{ hostname: 'https://x.test' }] })).toThrow(
      'images.remotePatterns'
    );
    const mode = (adapter: string, prerender = false, cloudflare = false) =>
      imageConfig({ cloudflare }, { adapter, prerender }).remote;
    expect([
      mode('node'),
      mode('cloudflare'),
      mode('cloudflare', false, true),
      mode('cloudflare', true),
    ]).toEqual(['endpoint', 'passthrough', 'cloudflare', 'endpoint']);
  });
});
