import { h } from 'lithent';
import type { WDom } from 'lithent';
import { SurfaceError } from './surfaceTree.js';
import { getBasePath } from './basePath.js';

/**
 * Images (DC-26, DESIGN 10.9). `import hero from './hero.png'` gives an `ImageAsset` with
 * the original size and the variants the build wrote; `<Image>` and `<Picture>` turn it into
 * `srcset`/`sizes` by layout, with `width`/`height` for CLS. Remote URLs need an allowed
 * `remotePatterns` entry and their size; they are resized by `/_surface/image` (Node, Bun,
 * Deno, prerender at build time) or used as they are (Workers).
 */

export type ImageFormat = 'webp' | 'avif' | 'png' | 'jpeg';

/** What importing a local image gives (written by the build plugin). */
export interface ImageAsset {
  src: string;
  width: number;
  height: number;
  format: ImageFormat;
  /** Format → `[width, url]` from small to large (the original width last). */
  variants: Partial<Record<ImageFormat, Array<[number, string]>>>;
}

export interface RemotePattern {
  protocol?: 'https' | 'http';
  /** `images.example.com`, `*.example.com` (one label) or `**.example.com` (any). */
  hostname: string;
  port?: string;
  /** Path glob: `*` within a segment, `**` across segments (default any). */
  pathname?: string;
}

export interface ImageConfig {
  widths: number[];
  /** Formats generated for local images and allowed for remote ones (`webp` always). */
  formats: ImageFormat[];
  remotePatterns: RemotePattern[];
  /**
   * How remote images load: `endpoint` (`/_surface/image`, resized on the server or at
   * prerender time), `passthrough` (the original URL, Workers) or `cloudflare` (Cloudflare
   * Images `/cdn-cgi/image/…`).
   */
  remote: 'endpoint' | 'passthrough' | 'cloudflare';
}

export const DEFAULT_WIDTHS = [640, 750, 828, 1080, 1280, 1920, 2048];
export const IMAGE_ENDPOINT = '/_surface/image';
const DEFAULTS: ImageConfig = {
  widths: DEFAULT_WIDTHS,
  formats: ['webp'],
  remotePatterns: [],
  remote: 'endpoint',
};
let config: ImageConfig = DEFAULTS;

/** Build configuration (set once by the generated manifest module). */
export function configureImages(value: Partial<ImageConfig>) {
  config = {
    ...DEFAULTS,
    ...value,
    formats: [...new Set(['webp', ...(value.formats ?? [])])] as ImageFormat[],
  };
}
export const imageConfig = () => config;

const glob = (pattern: string, segmentChars: string) =>
  new RegExp(
    '^' +
      pattern
        .split(/(\*\*|\*)/)
        .map(part =>
          part === '**'
            ? '.*'
            : part === '*'
              ? `[^${segmentChars}]*`
              : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        )
        .join('') +
      '$'
  );

/** Whether a remote URL is allowed by `images.remotePatterns` (DC-26: SSRF guard). */
export function allowedRemote(url: string, patterns = config.remotePatterns): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  if (parsed.username || parsed.password) return false;
  return patterns.some(
    pattern =>
      (pattern.protocol ?? 'https') + ':' === parsed.protocol &&
      glob(pattern.hostname, '.').test(parsed.hostname) &&
      (pattern.port === undefined || pattern.port === parsed.port) &&
      glob(pattern.pathname ?? '/**', '/').test(parsed.pathname)
  );
}

const isRemote = (src: string) => /^https?:\/\//i.test(src);

export type ImageLayout = 'constrained' | 'full-width' | 'fixed';

export interface ImageOptions {
  src: ImageAsset | string;
  /** Display width in CSS pixels (default: the original width; required for remote URLs). */
  width?: number;
  /** Display height (default: from the aspect ratio; required for remote URLs). */
  height?: number;
  layout?: ImageLayout;
  /** Overrides the generated `sizes`. */
  sizes?: string;
}

interface Resolved {
  width: number;
  height: number;
  /** Candidates per format, small to large. */
  candidates: (format: ImageFormat) => Array<[number, string]>;
  original: ImageFormat | undefined;
}

function remoteUrl(src: string, width: number, format: ImageFormat) {
  if (config.remote === 'cloudflare')
    return `/cdn-cgi/image/width=${width},format=${format}/${src}`;
  const query = new URLSearchParams({ url: src, w: String(width), f: format });
  return `${getBasePath()}${IMAGE_ENDPOINT}?${query}`;
}

function resolve(options: ImageOptions, where: string): Resolved {
  const { src } = options;
  if (typeof src === 'string') {
    if (!isRemote(src))
      throw new SurfaceError(
        `${where}: src "${src}" must be an imported image (import hero from './hero.png') or ` +
          'an absolute http(s) URL.'
      );
    if (!allowedRemote(src))
      throw new SurfaceError(
        `${where}: ${new URL(src).hostname} is not in images.remotePatterns (surface({ images })).`
      );
    if (!options.width || !options.height)
      throw new SurfaceError(`${where}: remote images need width and height (no layout shift).`);
    const { width, height } = options;
    return {
      width,
      height,
      original: undefined,
      candidates: format => {
        if (config.remote === 'passthrough') return [];
        // Up to twice the display width (2x screens), from the configured widths.
        const list = config.widths.filter(w => w < width * 2);
        const next = config.widths.find(w => w >= width * 2);
        return [...list, ...(next ? [next] : [])].map(w => [w, remoteUrl(src, w, format)]);
      },
    };
  }
  if (!src || typeof src !== 'object' || !src.width || !src.variants)
    throw new SurfaceError(`${where}: src must be an imported image or a remote URL.`);
  const width = options.width ?? src.width;
  const height = options.height ?? Math.round((width * src.height) / src.width);
  return {
    width,
    height,
    original: src.format,
    candidates: format => src.variants[format] ?? [],
  };
}

function srcsetOf(layout: ImageLayout, width: number, candidates: Array<[number, string]>) {
  if (!candidates.length) return { srcset: undefined, src: undefined };
  const fit = (target: number) =>
    candidates.find(([w]) => w >= target) ?? candidates[candidates.length - 1];
  if (layout === 'fixed') {
    const one = fit(width);
    const two = fit(width * 2);
    return {
      src: one[1],
      srcset: one[1] === two[1] ? `${one[1]} 1x` : `${one[1]} 1x, ${two[1]} 2x`,
    };
  }
  // Constrained: enough for 2x screens (up to the first candidate covering twice the width).
  const cover = candidates.findIndex(([w]) => w >= width * 2);
  const usable =
    layout === 'constrained' && cover >= 0 ? candidates.slice(0, cover + 1) : candidates;
  const list = usable.length ? usable : [candidates[0]];
  return { src: fit(width)[1], srcset: list.map(([w, url]) => `${url} ${w}w`).join(', ') };
}

const sizesOf = (layout: ImageLayout, width: number, sizes?: string) =>
  sizes ??
  (layout === 'full-width'
    ? '100vw'
    : layout === 'fixed'
      ? undefined
      : `(min-width: ${width}px) ${width}px, 100vw`);

const styleOf = (layout: ImageLayout) =>
  layout === 'full-width'
    ? 'width:100%;height:auto'
    : layout === 'constrained'
      ? 'max-width:100%;height:auto'
      : undefined;

const MIME: Record<ImageFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  png: 'image/png',
  jpeg: 'image/jpeg',
};

export interface ImageResult {
  src: string;
  srcset?: string;
  sizes?: string;
  width: number;
  height: number;
  type?: string;
}

/**
 * The URLs of an image for one format (default WebP): for CSS backgrounds
 * (`image-set()`) or inline styles (DESIGN 10.9).
 */
export function getImage(
  src: ImageAsset | string,
  options: Omit<ImageOptions, 'src'> & { format?: ImageFormat } = {}
): ImageResult {
  const where = 'getImage()';
  const layout = options.layout ?? 'constrained';
  const format = options.format ?? 'webp';
  if (!config.formats.includes(format) && format !== (typeof src === 'object' ? src.format : ''))
    throw new SurfaceError(`${where}: format "${format}" is not in images.formats.`);
  const resolved = resolve({ ...options, src }, where);
  const set = srcsetOf(layout, resolved.width, resolved.candidates(format));
  return {
    src: set.src ?? (typeof src === 'string' ? src : src.src),
    ...(set.srcset
      ? { srcset: set.srcset, sizes: sizesOf(layout, resolved.width, options.sizes) }
      : {}),
    width: resolved.width,
    height: resolved.height,
    ...(set.src ? { type: MIME[format] } : {}),
  };
}

/** The `<link rel="preload" as="image">` of a `priority` image (read by the SSR renderer). */
export interface ImagePreload {
  href: string;
  srcset?: string;
  sizes?: string;
  type?: string;
}
export const IMAGE_PRELOAD = Symbol.for('state-surface.image-preload');

type HtmlAttributes = Record<string, unknown>;
export interface ImageProps extends ImageOptions, HtmlAttributes {
  /** Required: describe the image, or `alt=""` for a decorative one. */
  alt: string;
  /** Above the fold (LCP): eager, `fetchpriority="high"` and a preload link in the head. */
  priority?: boolean;
}
export interface PictureProps extends ImageProps {
  /** `<source>` formats in order (default `['webp']`); the `<img>` keeps the original format. */
  formats?: ImageFormat[];
}

function checkAlt(props: { alt?: unknown }, where: string) {
  if (typeof props.alt !== 'string')
    throw new SurfaceError(`${where}: alt is required (use alt="" for a decorative image).`);
}

function imgAttributes(props: ImageProps, result: ImageResult, layout: ImageLayout) {
  const { src: _src, width: _w, height: _h, layout: _l, sizes: _s, priority, alt, ...rest } = props;
  delete (rest as { formats?: unknown }).formats;
  const style = [styleOf(layout), typeof rest.style === 'string' ? rest.style : undefined]
    .filter(Boolean)
    .join(';');
  return {
    ...rest,
    src: result.src,
    ...(result.srcset ? { srcset: result.srcset } : {}),
    ...(result.sizes ? { sizes: result.sizes } : {}),
    alt,
    width: result.width,
    height: result.height,
    loading: priority ? 'eager' : ((rest.loading as string) ?? 'lazy'),
    decoding: (rest.decoding as string) ?? 'async',
    ...(priority ? { fetchpriority: 'high' } : {}),
    ...(style ? { style } : {}),
  };
}

function withPreload(node: WDom, preload: ImagePreload | undefined) {
  if (preload) Object.defineProperty(node, IMAGE_PRELOAD, { value: preload });
  return node;
}

/** One `<img>` in WebP with `srcset`/`sizes` by layout (DC-26). */
export function Image(props: ImageProps): WDom {
  const where = '<Image>';
  checkAlt(props, where);
  const layout = props.layout ?? 'constrained';
  const result = getImage(props.src, { ...props, format: 'webp' });
  const node = h('img', imgAttributes(props, result, layout) as never);
  return withPreload(
    node,
    props.priority
      ? { href: result.src, srcset: result.srcset, sizes: result.sizes, type: result.type }
      : undefined
  );
}

/** `<source>` per format and an `<img>` in the original format (DC-26). */
export function Picture(props: PictureProps): WDom {
  const where = '<Picture>';
  checkAlt(props, where);
  const layout = props.layout ?? 'constrained';
  const formats = props.formats ?? ['webp'];
  for (const format of formats)
    if (!config.formats.includes(format))
      throw new SurfaceError(
        `${where}: format "${format}" is not generated; add it to surface({ images: { formats } }).`
      );
  const sources = formats.map(format => getImage(props.src, { ...props, format }));
  // The <img> keeps the original: the remote URL, or the imported file's own format.
  const fallback: ImageResult =
    typeof props.src === 'string'
      ? {
          ...getImage(props.src, { ...props, format: 'webp' }),
          src: props.src,
          srcset: undefined,
          sizes: undefined,
        }
      : getImage(props.src, { ...props, format: props.src.format });
  const first = sources[0];
  const node = h(
    'picture',
    {},
    ...sources
      .filter(source => source.srcset)
      .map(source =>
        h('source', {
          type: source.type,
          srcset: source.srcset,
          ...(source.sizes ? { sizes: source.sizes } : {}),
        } as never)
      ),
    h('img', imgAttributes(props, fallback, layout) as never)
  );
  return withPreload(
    node,
    props.priority && first
      ? { href: first.src, srcset: first.srcset, sizes: first.sizes, type: first.type }
      : undefined
  );
}

export function readImagePreload(node: unknown): ImagePreload | undefined {
  return node && typeof node === 'object'
    ? (node as { [IMAGE_PRELOAD]?: ImagePreload })[IMAGE_PRELOAD]
    : undefined;
}
