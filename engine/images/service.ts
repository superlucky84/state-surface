import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ImageFormat } from '../shared/image.js';
import type { ImageService } from '../server/core/imageEndpoint.js';

/**
 * sharp-based image transforms (DC-26) for builds, the dev server and the
 * `/_surface/image` endpoint of Node, Bun and Deno. sharp loads on first use and never
 * reaches a client bundle.
 */

type Sharp = (typeof import('sharp'))['default'];
let sharpModule: Promise<Sharp> | undefined;

export function loadSharp(): Promise<Sharp> {
  sharpModule ??= import('sharp').then(
    module => module.default ?? (module as unknown as Sharp),
    error => {
      sharpModule = undefined;
      throw new Error(
        `Image transforms need the "sharp" package (${(error as Error).message}). Install it ` +
          'with your package manager.'
      );
    }
  );
  return sharpModule;
}

export const MIME: Record<ImageFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  png: 'image/png',
  jpeg: 'image/jpeg',
};

/** Resize (never enlarge) and encode one variant. */
export async function encode(input: Uint8Array, width: number, format: ImageFormat) {
  const sharp = await loadSharp();
  const image = sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width, withoutEnlargement: true });
  const output =
    format === 'avif'
      ? image.avif({ quality: 55, effort: 4 })
      : format === 'png'
        ? image.png({ compressionLevel: 9 })
        : format === 'jpeg'
          ? image.jpeg({ quality: 80, mozjpeg: true })
          : image.webp({ quality: 78 });
  return new Uint8Array(await output.toBuffer());
}

/** Size and format of an image file (after EXIF rotation). */
export async function metadataOf(input: Uint8Array) {
  const sharp = await loadSharp();
  const meta = await sharp(input).metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  const format = (meta.format as string) === 'jpg' ? 'jpeg' : meta.format;
  if (!meta.width || !meta.height || !['png', 'jpeg', 'webp', 'avif', 'heif'].includes(format!))
    throw new Error(`Unsupported image (${meta.format ?? 'unknown format'}).`);
  return {
    width: rotated ? meta.height : meta.width,
    height: rotated ? meta.width : meta.height,
    format: (format === 'heif' ? 'avif' : format) as ImageFormat,
  };
}

class TransformError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export interface ImageServiceOptions {
  /** Disk cache (default `<tmp>/state-surface-images`, or `SURFACE_IMAGE_CACHE`). */
  cacheDir?: string;
  /** Project root for dev `src` files. */
  root?: string;
  /** Remote download limit in bytes (default 20MB). */
  maxBytes?: number;
  /** Remote download timeout in ms (default 10s). */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

async function download(url: string, options: ImageServiceOptions) {
  const limit = options.maxBytes ?? 20 * 1024 * 1024;
  // Redirects could leave the allowed hosts: they are not followed (DC-26 SSRF guard).
  const response = await (options.fetch ?? fetch)(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    headers: { accept: 'image/avif,image/webp,image/*' },
  });
  if (!response.ok) throw new TransformError(502, `Remote image answered ${response.status}`);
  if (!(response.headers.get('content-type') ?? '').startsWith('image/'))
    throw new TransformError(502, 'Remote resource is not an image');
  if (Number(response.headers.get('content-length') ?? 0) > limit)
    throw new TransformError(502, 'Remote image is too large');
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new TransformError(502, 'Remote image is too large');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) body.set(chunk, (offset += chunk.length) - chunk.length);
  return body;
}

/** The `/_surface/image` service with a content-addressed disk cache. */
export function createImageService(options: ImageServiceOptions = {}): ImageService {
  // Resolved on first use: adapters create the service at startup, and Deno without env or
  // temp-dir permissions must still start (only image requests fail then).
  let cacheDir: string | undefined;
  const directory = () => {
    if (cacheDir) return cacheDir;
    let configured: string | undefined;
    try {
      configured = process.env.SURFACE_IMAGE_CACHE;
    } catch {
      configured = undefined;
    }
    return (cacheDir =
      options.cacheDir ?? configured ?? path.join(os.tmpdir(), 'state-surface-images'));
  };
  const pending = new Map<string, Promise<Uint8Array>>();
  return {
    async transform(source, width, format) {
      let key: string;
      let input: () => Promise<Uint8Array>;
      if ('url' in source) {
        key = `url:${source.url}`;
        input = () => download(source.url, options);
      } else {
        const root = path.resolve(options.root ?? process.cwd());
        const file = path.resolve(root, '.' + source.file);
        if (!file.startsWith(root + path.sep)) throw new TransformError(400, 'Outside the root');
        const info = await stat(file).catch(() => undefined);
        if (!info?.isFile()) throw new TransformError(404, 'No such image');
        key = `file:${file}:${info.size}:${info.mtimeMs}`;
        input = async () => new Uint8Array(await readFile(file));
      }
      const hash = createHash('sha256').update(`${key}|${width}|${format}`).digest('hex');
      const target = path.join(directory(), `${hash.slice(0, 32)}.${format}`);
      let body = pending.get(target);
      if (!body) {
        body = (async () => {
          const cached = await readFile(target).catch(() => undefined);
          if (cached) return new Uint8Array(cached);
          const output = await encode(await input(), width, format).catch(error => {
            throw error instanceof TransformError
              ? error
              : new TransformError(502, (error as Error).message);
          });
          await mkdir(directory(), { recursive: true });
          const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
          await writeFile(temporary, output);
          await rename(temporary, target);
          return output;
        })();
        pending.set(target, body);
        body.finally(() => pending.delete(target)).catch(() => {});
      }
      return { body: await body, type: MIME[format] };
    },
  };
}
