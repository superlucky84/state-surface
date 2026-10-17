import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_WIDTHS,
  IMAGE_ENDPOINT,
  type ImageAsset,
  type ImageConfig,
  type ImageFormat,
  type RemotePattern,
} from '../shared/image.js';
import type { ImageService } from '../server/core/imageEndpoint.js';
import { encode, metadataOf } from '../images/service.js';
import { SurfaceBuildError } from './diagnostics.js';

/** `surface({ images })` (DC-26). */
export interface ImageOptions {
  /** srcset widths (default 640…2048); widths above an image's own width are skipped. */
  widths?: number[];
  /** Extra formats: `['avif']` for `<Picture formats={['avif', 'webp']}>` (WebP is always on). */
  formats?: Array<'webp' | 'avif'>;
  /** Remote hosts `<Image src="https://…">` may load (others are errors). */
  remotePatterns?: RemotePattern[];
  /** Workers: resize remote images with Cloudflare Images (`/cdn-cgi/image/…`). */
  cloudflare?: boolean;
}

export const IMAGE_FILE = /\.(?:png|jpe?g|webp|avif)$/i;
const EXTENSION: Record<ImageFormat, string> = {
  webp: 'webp',
  avif: 'avif',
  png: 'png',
  jpeg: 'jpg',
};

export function checkImageOptions(options: ImageOptions = {}) {
  for (const width of options.widths ?? [])
    if (!Number.isInteger(width) || width < 16 || width > 8192)
      throw new SurfaceBuildError(`images.widths: ${width} must be an integer from 16 to 8192.`);
  for (const format of options.formats ?? [])
    if (format !== 'webp' && format !== 'avif')
      throw new SurfaceBuildError(`images.formats: "${format}" must be "webp" or "avif".`);
  for (const pattern of options.remotePatterns ?? [])
    if (!pattern?.hostname || /[/:]/.test(pattern.hostname))
      throw new SurfaceBuildError(
        'images.remotePatterns: each entry needs a hostname like "images.example.com".'
      );
}

/** The runtime image config written into the manifest module. */
export function imageConfig(
  options: ImageOptions = {},
  runtime: { adapter: string; prerender: boolean }
): ImageConfig {
  const widths = [...new Set(options.widths ?? DEFAULT_WIDTHS)].sort((a, b) => a - b);
  return {
    widths,
    formats: ['webp', ...(options.formats ?? []).filter(format => format !== 'webp')],
    remotePatterns: options.remotePatterns ?? [],
    // Prerendering resizes remote images at build time (materializeImages below).
    remote:
      runtime.prerender || runtime.adapter !== 'cloudflare'
        ? 'endpoint'
        : options.cloudflare
          ? 'cloudflare'
          : 'passthrough',
  };
}

export interface ImageModuleContext {
  command: 'build' | 'serve';
  root: string;
  /** URL prefix (`''` or `/demo`). */
  base: string;
  /** Client output directory (`dist/client`). */
  clientDir: string;
  /** Encoded variant cache shared by builds (`node_modules/.state-surface/images`). */
  cacheDir: string;
  config: ImageConfig;
}

async function cachedEncode(
  input: Uint8Array,
  hash: string,
  width: number,
  format: ImageFormat,
  cacheDir: string
) {
  const file = path.join(cacheDir, `${hash}-${width}.${EXTENSION[format]}`);
  const cached = await readFile(file).catch(() => undefined);
  if (cached) return new Uint8Array(cached);
  const output = await encode(input, width, format);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, output);
  return output;
}

/**
 * `import hero from './hero.png'` → an `ImageAsset`. Builds write every width × format to
 * `dist/client/assets/<name>-<hash>-<width>.<ext>` (immutable URLs); dev points the variants
 * at `/_surface/image?src=…`, which resizes on request with a disk cache.
 */
export async function imageModule(file: string, context: ImageModuleContext): Promise<string> {
  const relative = path.relative(context.root, file).split(path.sep).join('/');
  const input = new Uint8Array(await readFile(file));
  let meta: Awaited<ReturnType<typeof metadataOf>>;
  try {
    meta = await metadataOf(input);
  } catch (error) {
    throw new SurfaceBuildError(`Cannot read image: ${(error as Error).message}`, {
      file: relative,
    });
  }
  const widths = [...context.config.widths.filter(width => width < meta.width), meta.width];
  const formats = [...new Set<ImageFormat>([...context.config.formats, meta.format])];
  const asset: ImageAsset = {
    src: '',
    width: meta.width,
    height: meta.height,
    format: meta.format,
    variants: {},
  };
  if (context.command === 'serve') {
    asset.src = `${context.base}/${relative}`;
    for (const format of formats)
      asset.variants[format] = widths.map(width => [
        width,
        `${context.base}${IMAGE_ENDPOINT}?${new URLSearchParams({ src: '/' + relative, w: String(width), f: format })}`,
      ]);
  } else {
    const hash = createHash('sha256').update(input).digest('hex').slice(0, 10);
    const name = path
      .basename(file)
      .replace(IMAGE_FILE, '')
      .replace(/[^\w-]/g, '_');
    const assets = path.join(context.clientDir, 'assets');
    await mkdir(assets, { recursive: true });
    const original = `assets/${name}-${hash}.${EXTENSION[meta.format]}`;
    await writeFile(path.join(context.clientDir, original), input);
    asset.src = `${context.base}/${original}`;
    for (const format of formats) {
      const list: Array<[number, string]> = [];
      for (const width of widths) {
        const target = `assets/${name}-${hash}-${width}.${EXTENSION[format]}`;
        await writeFile(
          path.join(context.clientDir, target),
          await cachedEncode(input, hash, width, format, context.cacheDir)
        );
        list.push([width, `${context.base}/${target}`]);
      }
      asset.variants[format] = list;
    }
  }
  return `export default ${JSON.stringify(asset)};`;
}

const ENDPOINT_URL = (base: string) =>
  new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${IMAGE_ENDPOINT}\\?[^"'\\s,]+`, 'g');

/**
 * Prerendered HTML has no image endpoint behind it on a static host: every
 * `/_surface/image?url=…` URL is resized now and replaced with a static asset (DC-26).
 */
export async function materializeImages(
  html: string,
  options: { base: string; clientDir: string; service: ImageService; done: Map<string, string> }
) {
  const found = [...new Set(html.match(ENDPOINT_URL(options.base)) ?? [])];
  for (const raw of found) {
    let target = options.done.get(raw);
    if (!target) {
      const params = new URL(raw.replace(/&amp;/g, '&'), 'http://build').searchParams;
      const url = params.get('url')!;
      const width = Number(params.get('w'));
      const format = params.get('f') as ImageFormat;
      const { body } = await options.service
        .transform({ url }, width, format)
        .catch((error: Error) => {
          throw new SurfaceBuildError(`Remote image ${url} (${width}w) failed: ${error.message}`);
        });
      const hash = createHash('sha256').update(`${url}|${width}|${format}`).digest('hex');
      target = `assets/remote-${hash.slice(0, 16)}-${width}.${EXTENSION[format]}`;
      await mkdir(path.join(options.clientDir, 'assets'), { recursive: true });
      await writeFile(path.join(options.clientDir, target), body);
      options.done.set(raw, target);
    }
    html = html.split(raw).join(`${options.base}/${target}`);
  }
  return html;
}

/** `.state-surface/images.d.ts`: image imports are `ImageAsset`s. */
export const IMAGE_TYPES = [
  '// Generated by state-surface: imported images are ImageAssets (DC-26). Do not edit.',
  ...['png', 'jpg', 'jpeg', 'webp', 'avif'].flatMap(ext => [
    `declare module '*.${ext}' {`,
    "  const image: import('state-surface').ImageAsset;",
    '  export default image;',
    '}',
  ]),
  '',
].join('\n');
