import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SurfaceBuildError } from './diagnostics.js';
import type { ServerManifest, ServerRoute } from '../server/core/manifest.js';
import type { HandlerOptions, SurfaceHandler } from '../server/core/handler.js';
import type { ImageService } from '../server/core/imageEndpoint.js';
import { materializeImages } from './images.js';

/** What the prerender bundle (`virtual:state-surface/prerender`) exports. */
export interface PrerenderBundle {
  manifest: ServerManifest;
  createHandler(options: HandlerOptions): SurfaceHandler;
  isPrerendered(route: ServerRoute, manifest: ServerManifest): boolean;
  staticParams(
    route: ServerRoute,
    manifest: ServerManifest
  ): Promise<Array<Record<string, string>>>;
}

export interface PrerenderOptions {
  /** Project root: stack frames under it (outside the engine) are the error location. */
  root: string;
  engineDir: string;
  /** Client output directory (`dist/client`): HTML goes to `<path>/index.html`. */
  clientDir: string;
  env?: Record<string, unknown>;
  /** Resizes remote `<Image>` URLs into static assets (DC-26). */
  images?: ImageService;
  /** Build warnings (the plugin logs them). */
  warn?: (message: string) => void;
}

export interface PrerenderedPage {
  /** URL path without BASE_PATH, decoded (`/en/guide/intro`). */
  path: string;
  file: string;
  route: ServerRoute;
  params: Record<string, string>;
}

const SEGMENT = /^[^/\\]+$/;
const isLangRoute = (pattern: string) => pattern === '/:lang' || pattern.startsWith('/:lang/');

/** URL paths of one prerendered route: the pattern, or its `getStaticPaths()` params. */
async function pathsOf(bundle: PrerenderBundle, route: ServerRoute, file: string) {
  const names = route.pattern
    .split('/')
    .filter(segment => segment.startsWith(':'))
    .map(segment => segment.slice(1));
  if (!names.length) return [{ params: {}, segments: route.pattern.split('/').filter(Boolean) }];
  let list: unknown[];
  try {
    list = await bundle.staticParams(route, bundle.manifest);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('getStaticPaths() must'))
      throw new SurfaceBuildError(error.message, { file });
    throw error;
  }
  const seen = new Set<string>();
  const locales =
    bundle.manifest.i18n && isLangRoute(route.pattern) ? bundle.manifest.i18n.locales : undefined;
  return list.map((item, index) => {
    const where = `getStaticPaths()[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new SurfaceBuildError(`${where} must be a params object like { slug: 'intro' }.`, {
        file,
      });
    const params = item as Record<string, string>;
    const keys = Object.keys(params).sort();
    if (keys.join() !== [...names].sort().join())
      throw new SurfaceBuildError(
        `${where} has params ${JSON.stringify(keys)}; the route needs ${JSON.stringify(names)}.`,
        { file }
      );
    for (const key of keys) {
      const value = params[key];
      if (typeof value !== 'string' || !SEGMENT.test(value) || value.startsWith('.'))
        throw new SurfaceBuildError(
          `${where}.${key} must be a non-empty string without "/" that does not start with ".".`,
          { file }
        );
    }
    if (locales && !locales.includes(params.lang))
      throw new SurfaceBuildError(
        `${where}.lang "${params.lang}" is not in i18n.locales (${locales.join(', ')}).`,
        { file }
      );
    const segments = route.pattern
      .split('/')
      .filter(Boolean)
      .map(segment => (segment.startsWith(':') ? params[segment.slice(1)] : segment));
    const key = segments.join('/');
    if (seen.has(key)) throw new SurfaceBuildError(`${where} repeats the path /${key}.`, { file });
    seen.add(key);
    return { params: { ...params }, segments };
  });
}

/** The first stack frame in project code (not the engine, not node_modules). */
function userFrame(stack: string, options: PrerenderOptions) {
  for (const match of stack.matchAll(/(?:file:\/\/)?(\/[^\s():]+):(\d+):(\d+)/g)) {
    let file = match[1];
    if (match[0].startsWith('file://')) file = fileURLToPath('file://' + file);
    if (!file.startsWith(options.root + path.sep)) continue;
    if (
      file.startsWith(options.engineDir + path.sep) ||
      file.includes(`${path.sep}node_modules${path.sep}`)
    )
      continue;
    return { file, line: Number(match[2]), column: Number(match[3]) };
  }
  return undefined;
}

async function located(error: unknown, urlPath: string, options: PrerenderOptions) {
  if (error instanceof SurfaceBuildError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const frame = error instanceof Error && error.stack ? userFrame(error.stack, options) : undefined;
  const code = frame ? await readFile(frame.file, 'utf8').catch(() => undefined) : undefined;
  const text =
    error instanceof Error && error.name === 'PrerenderAccessError'
      ? message
      : `Prerendering ${urlPath} failed: ${message}`;
  return new SurfaceBuildError(
    text,
    frame
      ? {
          file: path.relative(options.root, frame.file),
          code,
          line: frame.line,
          column: frame.column,
        }
      : {}
  );
}

/**
 * DC-24 ④: render every prerendered page with the production bundle into
 * `dist/client/<path>/index.html`. Errors carry the page file or, for a request-dependent
 * access, the stack frame in project code (source maps are on while rendering).
 */
export async function prerender(
  entry: string,
  options: PrerenderOptions
): Promise<PrerenderedPage[]> {
  const sourceMaps = process.sourceMapsEnabled;
  process.setSourceMapsEnabled(true);
  try {
    const bundle = (await import(
      `${pathToFileURL(entry).href}?t=${Date.now()}`
    )) as PrerenderBundle;
    const { manifest } = bundle;
    const routes = manifest.routes.filter(route => bundle.isPrerendered(route, manifest));
    if (!routes.length) return [];
    const handler = bundle.createHandler({ manifest, prerendering: true });
    const base = manifest.basePath ?? '';
    const pages: PrerenderedPage[] = [];
    const remoteImages = new Map<string, string>();
    for (const route of routes) {
      const file = route.page ? `routes/${route.page.id}.tsx` : route.pattern;
      let paths: Awaited<ReturnType<typeof pathsOf>>;
      try {
        paths = await pathsOf(bundle, route, file);
      } catch (error) {
        throw await located(error, route.pattern, options);
      }
      for (const { params, segments } of paths) {
        const urlPath = '/' + segments.join('/');
        const href = base + '/' + segments.map(encodeURIComponent).join('/');
        let response: Response;
        try {
          response = await handler.fetch(new Request(new URL(href || '/', 'http://localhost')), {
            env: options.env ?? {},
          });
        } catch (error) {
          throw await located(error, urlPath, options);
        }
        if (response.status !== 200)
          throw new SurfaceBuildError(
            `Prerendering ${urlPath} answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
            { file }
          );
        let html = await response.text();
        // DC-22 ③ with DC-24: a JS-less form redirects back to this page, whose built HTML
        // cannot show the one-time result (`ctx.flash` needs a request).
        if (html.includes(`action="${base}/_surface/action/`))
          options.warn?.(
            `${file} (${urlPath}) is prerendered and has a JS-less action form: without ` +
              'JavaScript the result after the redirect cannot be shown (ctx.flash needs a request). ' +
              'Render the page per request (export const prerender = false) if that matters.'
          );
        if (options.images)
          try {
            html = await materializeImages(html, {
              base,
              clientDir: options.clientDir,
              service: options.images,
              done: remoteImages,
            });
          } catch (error) {
            throw await located(error, urlPath, options);
          }
        const output = path.join(options.clientDir, ...segments, 'index.html');
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, html);
        pages.push({ path: urlPath, file: output, route, params });
        // Static hosting has no redirect: the language-less path is the default language with
        // a canonical link (a server redirects it before reading this file, DC-24 ⑤).
        const i18n = manifest.i18n;
        if (i18n && isLangRoute(route.pattern) && params.lang === i18n.defaultLocale) {
          const neutral = segments.slice(1);
          const canonical = `${manifest.site ?? ''}${href}`;
          const copy = html.replace(
            '<!--/ss:head-->',
            `<link rel="canonical" href="${canonical.replace(/"/g, '&quot;')}" data-ss><!--/ss:head-->`
          );
          const target = path.join(options.clientDir, ...neutral, 'index.html');
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, copy);
          pages.push({ path: '/' + neutral.join('/'), file: target, route, params });
        }
      }
    }
    return pages;
  } finally {
    process.setSourceMapsEnabled(sourceMaps);
  }
}
