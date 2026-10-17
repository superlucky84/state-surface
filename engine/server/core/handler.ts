import { createContext, sequence, type Middleware, type SurfaceContext } from './context.js';
import {
  isPrerendered,
  staticParams,
  type PageDefinition,
  type ServerManifest,
} from './manifest.js';
import { renderPage, renderSlotHtml, type DocumentTags, type PageUsage } from '../ssrRenderer.js';
import { resolveAsset, resolveAssetCss, resolveChunk } from '../assets.js';
import type { DocumentConfig } from './manifest.js';
import type { ErrorFrame, WireFrame } from '../../shared/protocol.js';
import { encodeFrame } from '../../shared/ndjson.js';
import type { Logger } from '../logger.js';
import {
  DEFAULT_LIMITS,
  FrameError,
  LimitError,
  RequestProjection,
  externalFrames,
  type TransitionLimits,
} from '../projection.js';
import { IdleTimeoutError, frameEncoder, produceFrames } from '../transitionResponse.js';
import { assertSecret, seal, unseal, type SecretSource } from '../secrets.js';
import { TransitionError } from '../transition.js';
import { validateSchema } from '../../shared/schema.js';
import { FLASH_COOKIE, openFlash, redirectTarget, sealFlash, type Flash } from '../flash.js';
import type { ActionMeta } from '../../shared/protocol.js';
import type { DeferredPayload } from '../ssrRenderer.js';
import { prerenderFile, prerenderView } from '../prerenderContext.js';
import { imageResponse, type ImageService } from './imageEndpoint.js';
import { prefixPath } from '../../shared/basePath.js';
import {
  LANG_COOKIE,
  alternates,
  i18nContext,
  isLangPattern,
  isPrefetch,
  negotiate,
} from '../i18n.js';

export interface HandlerOptions {
  manifest: ServerManifest;
  basePath?: string;
  security?: { headers?: boolean; allowedOrigins?: string[] };
  /** Request body limit in bytes (default 100KB, 413 above). */
  bodyLimit?: number;
  /** Transition timeouts and size limits (DC-14). */
  limits?: Partial<TransitionLimits>;
  /** Root secret (≥ 32 bytes). Defaults to `SURFACE_SECRET`, then the build secret (IC-09). */
  secret?: string;
  /** Previous root secret during rotation: decryption and verification only. */
  previousSecret?: string;
  /** Slot that shows transition errors (default `system:error`). */
  errorSlot?: string;
  /** Flash cookie size limit in bytes (default 3KB, DESIGN 10.5). */
  flashLimit?: number;
  development?: boolean;
  logger?: Logger;
  middleware?: Middleware[];
  onError?: (error: unknown, ctx: SurfaceContext) => void;
  /**
   * The adapter's static file reader (DC-32): prerendered pages answer with the built HTML
   * (`dist/client/<path>/index.html`) after the middleware ran. Without it (tests, dev) they
   * render on every request with the prerender context.
   */
  readStatic?: (file: string, platform: Record<string, unknown>) => Promise<Response | null>;
  /** Build only: render prerendered pages, skip middleware and throw errors to the caller. */
  prerendering?: boolean;
  /** `/_surface/image` transforms (DC-26): Node, Bun and Deno adapters pass one. */
  images?: ImageService;
}
export interface SurfaceHandler {
  fetch(
    request: Request,
    platform?: { env?: Record<string, unknown>; [key: string]: unknown }
  ): Promise<Response>;
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'Malformed path encoding');
  }
}
function normalizeBase(path: string) {
  return path === '/' ? '' : '/' + path.replace(/^\/+|\/+$/g, '');
}

async function readBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > limit) {
          void reader.cancel().catch(() => {});
          throw new HttpError(413, 'Request body too large');
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}

/** Same name more than once → array (DESIGN 10.5). */
function formToObject(form: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    const current = result[key];
    if (current === undefined) result[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else result[key] = [current, value];
  }
  return result;
}

/** Transition params: JSON object, form-urlencoded or multipart body. */
async function readParams(request: Request, limit: number): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? '';
  const data = await readBody(request, limit);
  if (/multipart\/form-data|application\/x-www-form-urlencoded/i.test(type)) {
    try {
      return formToObject(
        await new Response(data, { headers: { 'content-type': type } }).formData()
      );
    } catch {
      throw new HttpError(400, 'Malformed form body');
    }
  }
  try {
    const parsed = data.byteLength
      ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
      : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new HttpError(400, 'Expected a JSON object');
  }
}

/** Flash never carries uploaded files (DESIGN 10.5). */
function withoutFiles(value: unknown): unknown {
  const isFile = (item: unknown) => typeof Blob !== 'undefined' && item instanceof Blob;
  if (Array.isArray(value)) {
    const kept = value.filter(item => !isFile(item));
    return kept.length ? kept : undefined;
  }
  return isFile(value) ? undefined : value;
}

const isPayload = (value: unknown): value is DeferredPayload => {
  const payload = value as Partial<DeferredPayload> | null;
  return (
    !!payload &&
    typeof payload.c === 'string' &&
    typeof payload.s === 'string' &&
    typeof payload.b === 'string' &&
    !!payload.p &&
    typeof payload.p === 'object' &&
    ['strict', 'rich', 'unsafe'].includes(payload.k as string)
  );
};

export function createHandler(options: HandlerOptions): SurfaceHandler {
  const { manifest } = options;
  const buildId = manifest.buildId ?? 'dev';
  const components = manifest.components ?? {};
  const basePath = options.basePath ? normalizeBase(options.basePath) : (manifest.basePath ?? '');
  if (manifest.basePath !== undefined && manifest.basePath !== basePath)
    throw new Error('BASE_PATH must match the application build');
  const bodyLimit = options.bodyLimit ?? 100 * 1024;
  if (!Number.isSafeInteger(bodyLimit) || bodyLimit < 0)
    throw new Error('bodyLimit must be a nonnegative byte count');
  const limits: TransitionLimits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits))
    if (!Number.isFinite(value) || value <= 0) throw new Error(`limits.${key} must be positive`);
  if (options.secret !== undefined) assertSecret(options.secret);
  if (options.previousSecret !== undefined)
    assertSecret(options.previousSecret, 'SURFACE_SECRET_PREVIOUS');
  const errorSlot = options.errorSlot ?? 'system:error';
  const flashLimit = options.flashLimit ?? 3 * 1024;
  // DC-11: the browser needs targets and queue mode to decide which actions abort each other.
  const actionMeta: Record<string, ActionMeta> = {};
  for (const [name, definition] of Object.entries(manifest.transitions))
    if (definition.targets || definition.mode === 'queue')
      actionMeta[name] = {
        ...(definition.targets ? { targets: [...definition.targets] } : {}),
        ...(definition.mode === 'queue' ? { queue: true as const } : {}),
      };
  const documentTags = createDocumentTags(manifest.document ?? {});
  const i18n = manifest.i18n;
  const routes = manifest.routes.map(route => ({
    ...route,
    segments: route.pattern.split('/').filter(Boolean),
    prerender: isPrerendered(route, manifest),
    // DC-24 ⑤: `routes/[lang]/…` match only configured locales.
    lang: !!i18n && isLangPattern(route.pattern),
  }));
  const matches = (route: (typeof routes)[number], segments: string[]) =>
    route.segments.length === segments.length &&
    route.segments.every((s, i) => s.startsWith(':') || s === segments[i]) &&
    (!route.lang || i18n!.locales.includes(segments[0]));
  // Rendering prerendered dynamic routes on request (dev, no static reader): only listed params.
  const staticPaths = new Map<(typeof routes)[number], Promise<Set<string>>>();
  const paramKey = (params: Record<string, string>) =>
    JSON.stringify(
      Object.keys(params)
        .sort()
        .map(key => [key, params[key]])
    );
  const listed = (route: (typeof routes)[number], params: Record<string, string>) => {
    if (!route.pattern.includes(':')) return Promise.resolve(true);
    let paths = staticPaths.get(route);
    if (!paths) {
      paths = staticParams(route, manifest).then(
        list => new Set(list.map(item => paramKey(item))),
        error => {
          staticPaths.delete(route);
          throw error;
        }
      );
      staticPaths.set(route, paths);
    }
    return paths.then(set => set.has(paramKey(params)));
  };
  const etag = `"${buildId}"`;
  const pages = new Map<string, PageDefinition>();
  for (const route of manifest.routes) if (route.page) pages.set(route.page.id, route.page);
  const report = (error: unknown, ctx: SurfaceContext) => {
    try {
      options.onError?.(error, ctx);
    } catch {
      /* instrumentation must not replace application errors */
    }
    options.logger?.error(
      `[${ctx.route.kind}] ${ctx.url.pathname}: ${error instanceof Error ? error.message : String(error)}`
    );
  };
  const warn = (message: string) => options.logger?.warn(message);
  const secrets = (ctx: SurfaceContext): SecretSource => {
    const env = (name: string) =>
      typeof ctx.env[name] === 'string' ? (ctx.env[name] as string) : undefined;
    const current = options.secret ?? env('SURFACE_SECRET') ?? manifest.secret;
    if (!current) throw new Error('Deferred slots need SURFACE_SECRET or a build secret');
    return {
      current,
      previous: options.previousSecret ?? env('SURFACE_SECRET_PREVIOUS'),
      built: manifest.secret,
    };
  };

  return {
    async fetch(request, platform = {}) {
      const started = performance.now();
      const controller = new AbortController();
      const signal = AbortSignal.any([request.signal, controller.signal]);
      const context = createContext(request, {
        basePath,
        signal,
        env: platform.env,
        platform,
        development: options.development,
        logger: options.logger,
      });
      const { ctx } = context;
      ctx.flash = async name => {
        const value = ctx.cookies.get(FLASH_COOKIE);
        if (!value) return undefined;
        const flash = await openFlash(secrets(ctx), value);
        if (!flash || flash.n !== name) return undefined;
        ctx.cookies.delete(FLASH_COOKIE);
        const { n: _name, ...result } = flash;
        return result;
      };
      let streamOwnsCleanup = false;
      let cleanup = () => {};
      try {
        const pathname = ctx.url.pathname;
        const mounted = !basePath || pathname === basePath || pathname.startsWith(basePath + '/');
        const path = mounted ? pathname.slice(basePath.length) || '/' : '';
        const segments = path.split('/').filter(Boolean);
        // Transition names are paths under transitions/ (DC-16 ③): `/transition/comment/add`.
        const nameAfter = (...prefix: string[]) =>
          segments.length > prefix.length && prefix.every((part, i) => segments[i] === part)
            ? segments.slice(prefix.length).map(decodeSegment).join('/')
            : undefined;
        const transitionName = nameAfter('transition');
        const actionName = nameAfter('_surface', 'action');
        const islandId =
          segments.length === 3 && segments[0] === '_surface' && segments[1] === 'island'
            ? decodeSegment(segments[2])
            : undefined;
        let selected: (typeof routes)[number] | undefined;
        if (mounted && ['GET', 'HEAD'].includes(request.method)) {
          selected = routes.find(route => matches(route, segments));
          if (selected) {
            ctx.params = Object.fromEntries(
              selected.segments.flatMap((s, i) =>
                s.startsWith(':') ? [[s.slice(1), decodeSegment(segments[i])]] : []
              )
            );
            ctx.route = {
              kind: 'page',
              pattern: selected.pattern,
              prerendered: selected.prerender,
            };
            if (selected.lang)
              ctx.i18n = i18nContext(
                i18n!,
                segments[0],
                segments.slice(1).map(decodeSegment),
                basePath
              );
          }
        }
        // Language paths: a path without a language redirects to one, `?lang=xx` switches and
        // remembers it. Prefetches never switch (the click asks again).
        let redirect: { lang: string; path: string; remember: boolean } | undefined;
        const requested = ctx.url.searchParams.get(LANG_COOKIE);
        const switchTo = requested && i18n?.locales.includes(requested) ? requested : undefined;
        if (i18n && mounted && ['GET', 'HEAD'].includes(request.method)) {
          if (selected?.lang && switchTo)
            redirect = { lang: switchTo, path: ctx.i18n!.path, remember: true };
          else if (
            !selected &&
            routes.some(route => route.lang && matches(route, [i18n.defaultLocale, ...segments]))
          ) {
            const cookie = ctx.cookies.get(LANG_COOKIE);
            redirect = {
              lang:
                switchTo ??
                (cookie && i18n.locales.includes(cookie) ? cookie : undefined) ??
                negotiate(request.headers.get('accept-language'), i18n.locales) ??
                i18n.defaultLocale,
              path: path,
              remember: !!switchTo,
            };
          }
          if (redirect) {
            selected = undefined;
            ctx.route = { kind: 'redirect', prerendered: false };
          }
        }
        if (mounted && request.method === 'POST' && transitionName)
          ctx.route = { kind: 'transition', name: transitionName, prerendered: false };
        if (mounted && request.method === 'POST' && actionName)
          ctx.route = { kind: 'action', name: actionName, prerendered: false };
        if (
          mounted &&
          segments.length === 2 &&
          segments[0] === '_surface' &&
          segments[1] === 'image' &&
          ['GET', 'HEAD'].includes(request.method)
        ) {
          selected = undefined;
          ctx.route = { kind: 'image', prerendered: false };
        }
        if (mounted && islandId && ['GET', 'HEAD', 'POST'].includes(request.method)) {
          selected = undefined;
          ctx.route = { kind: 'island', name: islandId, prerendered: false };
        }
        if (request.method === 'POST') {
          const origin = request.headers.get('origin');
          const site = request.headers.get('sec-fetch-site');
          if (
            origin
              ? origin !== ctx.url.origin && !options.security?.allowedOrigins?.includes(origin)
              : site !== null && site !== 'same-origin' && site !== 'none'
          )
            throw new HttpError(403, 'Cross-origin POST forbidden');
        }
        const buildMatches = () => request.headers.get('x-surface-build') === buildId;
        const mismatch = () =>
          Response.json(
            { error: 'Build mismatch', buildId },
            { status: 409, headers: { 'cache-control': 'no-store' } }
          );

        const island = async (): Promise<Response> => {
          const token =
            request.method === 'POST'
              ? new TextDecoder().decode(await readBody(request, bodyLimit)).trim()
              : (ctx.url.searchParams.get('p') ?? '');
          if (!token) throw new HttpError(400, 'Missing deferred slot token');
          let payload: unknown;
          try {
            payload = await unseal(secrets(ctx), token);
          } catch {
            throw new HttpError(400, 'Invalid deferred slot token');
          }
          if (!isPayload(payload)) throw new HttpError(400, 'Invalid deferred slot token');
          if (payload.b !== buildId || (request.headers.has('x-surface-build') && !buildMatches()))
            return mismatch();
          if (payload.c !== islandId) throw new HttpError(400, 'Token does not match component');
          if (!Object.hasOwn(components, payload.c))
            return new Response('Not Found', { status: 404 });
          const rendered = await renderSlotHtml({
            slot: payload.s,
            component: components[payload.c],
            props: payload.p,
            ctx,
            capability: payload.k,
            sandbox: payload.i,
          });
          return Response.json(
            {
              html: rendered.html,
              ...(rendered.islands.length ? { islands: rendered.islands } : {}),
            },
            {
              headers: {
                'cache-control':
                  request.method === 'POST'
                    ? 'private, no-store'
                    : (payload.x ?? 'private, no-store'),
              },
            }
          );
        };

        const transition = async (): Promise<Response> => {
          if (!buildMatches()) return mismatch();
          const pageId = request.headers.get('x-surface-page');
          const page = pageId ? pages.get(pageId) : undefined;
          if (!page)
            return Response.json({ error: 'Unknown or missing X-Surface-Page' }, { status: 400 });
          const definition = Object.hasOwn(manifest.transitions, transitionName!)
            ? manifest.transitions[transitionName!]
            : undefined;
          if (!definition)
            return Response.json(
              { error: `Transition "${transitionName}" not found` },
              { status: 404 }
            );
          const raw = await readParams(request, bodyLimit);
          const { _redirect: _ignored, ...input } = raw;

          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            controller.abort(new Error(`Transition timeout after ${limits.timeout}ms`));
          }, limits.timeout);
          const projection = new RequestProjection({
            name: transitionName!,
            definition,
            page,
            ctx,
            limits,
            development: !!options.development,
            errorSlot,
            warn: message => warn(message),
          });
          ctx.external = externalFrames(projection, warn);
          // DC-22 ②: invalid input never runs the handler; the error frame carries field errors.
          let params: Record<string, unknown> = input;
          if (definition.input) {
            const checked = await validateSchema(definition.input, input);
            if (!checked.ok) {
              clearTimeout(timer);
              const frame = await projection.error(checked.message, {
                kind: 'validation',
                fieldErrors: checked.fieldErrors,
              });
              return Response.json({ frames: [frame] }, { status: 422 });
            }
            params = checked.value as Record<string, unknown>;
          }
          let frames: AsyncGenerator<WireFrame, void, unknown> | undefined;
          let released = false;
          const release = () => {
            if (released) return;
            released = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', release);
            void frames?.return(undefined).catch(error => report(error, ctx));
          };
          cleanup = release;
          const failure = async (error: unknown): Promise<ErrorFrame | undefined> => {
            if (request.signal.aborted) return undefined;
            report(error, ctx);
            const message = timedOut
              ? `Transition timeout after ${limits.timeout}ms`
              : error instanceof LimitError ||
                  error instanceof IdleTimeoutError ||
                  error instanceof TransitionError
                ? error.message
                : options.development
                  ? error instanceof Error
                    ? error.message
                    : 'Unknown server error'
                  : 'Transition failed';
            if (options.development && error instanceof FrameError)
              warn(`${error.message}\n${error.stack ?? ''}`);
            return projection.error(
              message,
              timedOut || error instanceof IdleTimeoutError ? { kind: 'timeout' } : {}
            );
          };

          let streaming = false;
          let first: WireFrame | undefined;
          try {
            const result = definition.handler(params, ctx);
            streaming =
              !!result &&
              typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';
            frames = produceFrames(result, projection, limits, signal);
            const next = await frames.next();
            first = next.done ? { type: 'done' } : next.value;
          } catch (error) {
            context.discard();
            const frame = await failure(error);
            release();
            if (request.signal.aborted) throw error;
            const body = frame ?? { type: 'error' as const, message: 'Transition failed' };
            return streaming
              ? new Response(encodeFrame(body), {
                  status: 500,
                  headers: { 'content-type': 'application/x-ndjson' },
                })
              : Response.json({ frames: [body] }, { status: 500 });
          }
          // Cookies set before the first frame are sent (DC-27); later writes are ignored.
          context.lock();
          const encode = frameEncoder(limits, (key, text) => projection.warnOnce(key, text));
          // Action-level View Transition (DC-06 ②): the browser wraps the first patch.
          const vt: Record<string, string> = definition.viewTransition
            ? { 'x-surface-view-transition': '1' }
            : {};
          const terminal = (frame: WireFrame) => frame.type === 'done' || frame.type === 'error';

          if (!streaming) {
            const collected: WireFrame[] = [];
            let frame: WireFrame | undefined = first;
            try {
              while (frame) {
                encode(frame);
                collected.push(frame);
                if (terminal(frame)) break;
                const next = await frames!.next();
                frame = next.done ? undefined : next.value;
              }
            } catch (error) {
              const errorFrame = await failure(error);
              if (errorFrame) collected.push(errorFrame);
            }
            release();
            return Response.json(
              { frames: collected },
              { headers: { 'cache-control': 'no-cache', ...vt } }
            );
          }

          let canceled = false;
          let pendingFirst: WireFrame | undefined = first;
          const stream = new ReadableStream<Uint8Array>(
            {
              async pull(target) {
                try {
                  let frame = pendingFirst;
                  pendingFirst = undefined;
                  if (!frame) {
                    const next = await frames!.next();
                    frame = next.done ? undefined : next.value;
                  }
                  if (!frame) {
                    target.close();
                    release();
                    return;
                  }
                  target.enqueue(encode(frame));
                  if (terminal(frame)) {
                    target.close();
                    release();
                  }
                } catch (error) {
                  if (canceled) return release();
                  const errorFrame = await failure(error);
                  if (errorFrame) target.enqueue(new TextEncoder().encode(encodeFrame(errorFrame)));
                  target.close();
                  release();
                }
              },
              cancel() {
                canceled = true;
                controller.abort();
                release();
              },
            },
            { highWaterMark: 0 }
          );
          // Even without a consumer, request cancellation releases the generator/timer.
          signal.addEventListener('abort', release, { once: true });
          streamOwnsCleanup = true;
          return new Response(stream, {
            headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache', ...vt },
          });
        };

        // JS-less form submission (PRG, DC-22 ③): run the transition, drop its frames, store the
        // result in a signed one-time cookie and answer 303 to a same-origin page.
        const action = async (): Promise<Response> => {
          const definition = Object.hasOwn(manifest.transitions, actionName!)
            ? manifest.transitions[actionName!]
            : undefined;
          if (!definition) return new Response('Not Found', { status: 404 });
          const raw = await readParams(request, bodyLimit);
          const { _redirect: requested, ...input } = raw;
          const location = redirectTarget(
            requested,
            request.headers.get('referer'),
            ctx.url.origin,
            basePath
          );
          let flash: Flash = { ok: true };
          try {
            let params: Record<string, unknown> = input;
            if (definition.input) {
              const checked = await validateSchema(definition.input, input);
              if (!checked.ok)
                throw Object.assign(new TransitionError(checked.message), {
                  fieldErrors: checked.fieldErrors,
                });
              params = checked.value as Record<string, unknown>;
            }
            const timer = setTimeout(
              () => controller.abort(new Error(`Transition timeout after ${limits.timeout}ms`)),
              limits.timeout
            );
            try {
              const result = definition.handler(params, ctx);
              if (
                result &&
                typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
              ) {
                for await (const _frame of result as AsyncIterable<unknown>)
                  if (signal.aborted) break;
              } else await result;
              if (signal.aborted) throw signal.reason;
            } finally {
              clearTimeout(timer);
            }
          } catch (error) {
            const fieldErrors = (error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
            if (!fieldErrors) report(error, ctx);
            flash = {
              ok: false,
              error: {
                message:
                  error instanceof TransitionError || options.development
                    ? error instanceof Error
                      ? error.message
                      : String(error)
                    : 'Transition failed',
                kind: fieldErrors ? 'validation' : 'server',
                ...(fieldErrors ? { fieldErrors } : {}),
              },
            };
          }
          const echoed = Object.fromEntries(
            (definition.flash?.input ?? [])
              .filter(field => Object.hasOwn(input, field))
              .map(field => [field, withoutFiles(input[field])])
              .filter(([, value]) => value !== undefined)
          );
          if (Object.keys(echoed).length) flash.input = echoed;
          const sealed = await sealFlash(secrets(ctx), actionName!, flash, flashLimit);
          if (sealed.trimmed.length && options.development)
            warn(
              `[flash] "${actionName}" exceeded ${flashLimit} bytes; dropped ${sealed.trimmed.join(', ')}`
            );
          ctx.cookies.set(FLASH_COOKIE, sealed.value, {
            httpOnly: true,
            maxAge: 60,
            secure: ctx.url.protocol === 'https:',
          });
          return new Response(null, {
            status: 303,
            headers: { location, 'cache-control': 'no-store' },
          });
        };

        const notFound = () => new Response('Not Found', { status: 404 });
        const languageRedirect = (target: NonNullable<typeof redirect>) => {
          if (target.remember && isPrefetch(request))
            return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
          if (target.remember) ctx.cookies.set(LANG_COOKIE, target.lang, { maxAge: 31536000 });
          const query = new URLSearchParams(ctx.url.search);
          query.delete(LANG_COOKIE);
          const search = query.size ? `?${query}` : '';
          const rest = target.path === '/' ? '' : target.path;
          return new Response(null, {
            status: 302,
            headers: {
              location: `${basePath}/${target.lang}${rest}${search}`,
              'cache-control': 'private, no-store',
              vary: 'cookie, accept-language',
            },
          });
        };
        const dispatch = async (): Promise<Response> => {
          if (ctx.route.kind === 'redirect' && redirect) return languageRedirect(redirect);
          if (ctx.route.kind === 'page' && selected?.prerender) {
            // DC-32: the built HTML, after the middleware; ETag is the build identity.
            if (options.readStatic && !options.prerendering && !options.development) {
              const file = prerenderFile(segments.map(decodeSegment));
              const stored = file
                ? await options.readStatic(file, { ...platform, origin: ctx.url.origin })
                : null;
              if (!stored) return notFound();
              const headers = {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'public, max-age=0, must-revalidate',
                etag,
              };
              const match = request.headers.get('if-none-match');
              if (match && match.split(',').some(tag => tag.trim().replace(/^W\//, '') === etag)) {
                await stored.body?.cancel();
                return new Response(null, { status: 304, headers });
              }
              return new Response(stored.body, { headers });
            }
            if (!(await listed(selected, ctx.params))) return notFound();
          }
          if (ctx.route.kind === 'page' && selected)
            return new Response(
              await renderPage(selected.module, selected.prerender ? prerenderView(ctx) : ctx, {
                plugins: selected.plugins,
                tags: usage => documentTags(usage, selected.page),
                buildId,
                pageId: selected.page?.id,
                seal: payload => seal(secrets(ctx), payload),
                actions: actionMeta,
                ...(ctx.i18n
                  ? {
                      alternates: alternates(
                        ctx.i18n,
                        manifest.site ?? (selected.prerender ? '' : ctx.url.origin)
                      ),
                    }
                  : {}),
              }),
              { headers: { 'content-type': 'text/html; charset=utf-8' } }
            );
          if (ctx.route.kind === 'island') return island();
          if (ctx.route.kind === 'image')
            return imageResponse(ctx.url, manifest.images, options.images, !!options.development);
          if (ctx.route.kind === 'transition') return transition();
          if (ctx.route.kind === 'action') return action();
          return notFound();
        };
        // Build-time rendering runs no request middleware (it runs when the HTML is served).
        const response = options.prerendering
          ? await dispatch()
          : await sequence(...(options.middleware ?? []))(ctx, dispatch);
        const headers = new Headers(response.headers);
        context.lock();
        for (const value of context.outgoing) headers.append('set-cookie', value);
        if (options.security?.headers !== false) {
          headers.set('x-content-type-options', 'nosniff');
          headers.set('x-frame-options', 'SAMEORIGIN');
        }
        // A page whose chunks failed compares this with its own build (DC-04 ③).
        if (ctx.route.kind === 'page') headers.set('x-surface-build', buildId);
        options.logger?.info(
          `[HTTP] ${request.method} ${ctx.url.pathname} ${response.status} ${(performance.now() - started).toFixed(1)}ms`
        );
        if (request.method === 'HEAD') {
          await response.body?.cancel();
          return new Response(null, { status: response.status, headers });
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (error) {
        context.discard();
        if (options.prerendering) throw error;
        report(error, ctx);
        const status = error instanceof HttpError ? error.status : 500;
        return new Response(
          error instanceof HttpError
            ? error.message
            : options.development
              ? `SSR Error: ${error instanceof Error ? error.message : String(error)}`
              : 'Internal Server Error',
          {
            status,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              ...(options.security?.headers === false
                ? {}
                : { 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN' }),
            },
          }
        );
      } finally {
        if (!streamOwnsCleanup) cleanup();
      }
    },
  };
}

/**
 * Entry selection (DESIGN 5.1): every page gets the global styles and the app entry; the
 * engine loader only when the page uses client components, actions, `<Boot>`, deferred
 * slots or plugins. Rendered client components add their chunk CSS; `client:load`
 * components, the action runtime and the morph chunk are modulepreloaded so the loader does
 * not wait on a request waterfall.
 */
function createDocumentTags(document: DocumentConfig) {
  // Asset URLs are immutable build configuration; resolve the static parts once.
  const styles = (document.styles ?? []).flatMap(resolveAssetCss);
  const appEntry = document.appEntry && resolveAsset(document.appEntry);
  const engine = document.engine;
  const engineEntry = engine && resolveAsset(engine.loader);
  const loaded = new Set(engine ? (resolveChunk(engine.loader)?.files ?? []) : []);
  return (usage: PageUsage, page?: PageDefinition): DocumentTags => {
    const pageStyles = page?.styles?.length
      ? [...new Set([...styles, ...page.styles.map(href => prefixPath(href))])]
      : styles;
    if (!usage.engine || !engine) return { styles: pageStyles, preload: [], appEntry };
    const css = new Set(pageStyles);
    const preload = new Set<string>();
    const add = (source: string, eager: boolean) => {
      const chunk = resolveChunk(source);
      for (const file of chunk?.css ?? []) css.add(file);
      if (eager) for (const file of chunk?.files ?? []) if (!loaded.has(file)) preload.add(file);
    };
    const eager = usage.components.some(component => component.preload);
    if (usage.actions) add(engine.runtime, true);
    if (usage.morph && engine.morph) add(engine.morph, true);
    if (usage.router && engine.router) add(engine.router, true);
    if (usage.components.length) add(engine.bridge, eager);
    for (const component of usage.components)
      add(
        '/' + component.componentId.slice(0, component.componentId.lastIndexOf('#')),
        component.preload
      );
    for (const plugin of usage.plugins)
      add('/' + plugin.id.slice(0, plugin.id.lastIndexOf('#')), false);
    return { styles: [...css], preload: [...preload], appEntry, engineEntry };
  };
}
