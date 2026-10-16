import { createContext, sequence, type Middleware, type SurfaceContext } from './context.js';
import type { ServerManifest } from './manifest.js';
import { renderPage } from '../ssrRenderer.js';
import { resolveAsset, resolveAssetCss } from '../assets.js';
import { validateStateFrame, type StateFrame } from '../../shared/protocol.js';
import { encodeFrame } from '../../shared/ndjson.js';
import type { Logger } from '../logger.js';

export interface HandlerOptions {
  manifest: ServerManifest;
  basePath?: string;
  security?: { headers?: boolean; allowedOrigins?: string[] };
  bodyLimit?: number;
  transitionTimeout?: number;
  development?: boolean;
  logger?: Logger;
  middleware?: Middleware[];
  onError?: (error: unknown, ctx: SurfaceContext) => void;
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

export function createHandler(options: HandlerOptions): SurfaceHandler {
  const basePath = options.basePath
    ? normalizeBase(options.basePath)
    : (options.manifest.basePath ?? '');
  if (options.manifest.basePath !== undefined && options.manifest.basePath !== basePath)
    throw new Error('BASE_PATH must match the application build');
  const bodyLimit = options.bodyLimit ?? 100 * 1024;
  if (!Number.isSafeInteger(bodyLimit) || bodyLimit < 0)
    throw new Error('bodyLimit must be a nonnegative byte count');
  // Asset URLs are immutable build configuration; resolve them once per handler.
  const documentTags = {
    styles: (options.manifest.document?.styles ?? []).flatMap(resolveAssetCss),
    entry: options.manifest.document?.entry && resolveAsset(options.manifest.document.entry),
  };
  const routes = options.manifest.routes.map(route => ({
    ...route,
    segments: route.pattern.split('/').filter(Boolean),
  }));
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
      let streamOwnsCleanup = false;
      let cleanup = () => {};
      try {
        const pathname = ctx.url.pathname;
        const mounted = !basePath || pathname === basePath || pathname.startsWith(basePath + '/');
        const path = mounted ? pathname.slice(basePath.length) || '/' : '';
        const segments = path.split('/').filter(Boolean);
        const transitionName =
          segments.length === 2 && segments[0] === 'transition'
            ? decodeSegment(segments[1])
            : undefined;
        let selected: (typeof routes)[number] | undefined;
        if (mounted && ['GET', 'HEAD'].includes(request.method)) {
          selected = routes.find(
            route =>
              route.segments.length === segments.length &&
              route.segments.every((s, i) => s.startsWith(':') || s === segments[i])
          );
          if (selected) {
            ctx.params = Object.fromEntries(
              selected.segments.flatMap((s, i) =>
                s.startsWith(':') ? [[s.slice(1), decodeSegment(segments[i])]] : []
              )
            );
            ctx.route = { kind: 'page', pattern: selected.pattern, prerendered: false };
          }
        }
        if (mounted && request.method === 'POST' && transitionName)
          ctx.route = { kind: 'transition', name: transitionName, prerendered: false };
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
        const dispatch = async (): Promise<Response> => {
          if (ctx.route.kind === 'page' && selected)
            return new Response(await renderPage(selected.module, ctx, documentTags), {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            });
          if (ctx.route.kind !== 'transition') return new Response('Not Found', { status: 404 });
          const handler = Object.hasOwn(options.manifest.transitions, transitionName!)
            ? options.manifest.transitions[transitionName!]
            : undefined;
          if (!handler)
            return Response.json(
              { error: `Transition "${transitionName}" not found` },
              { status: 404 }
            );
          const chunks: Uint8Array[] = [];
          let size = 0;
          const reader = request.body?.getReader();
          if (reader) {
            try {
              while (true) {
                const next = await reader.read();
                if (next.done) break;
                size += next.value.byteLength;
                if (size > bodyLimit) {
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
          let params: Record<string, unknown>;
          try {
            const parsed = size
              ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
              : {};
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
            params = parsed;
          } catch {
            throw new HttpError(400, 'Expected a JSON object');
          }
          const duration = options.transitionTimeout ?? 30_000;
          if (!Number.isFinite(duration) || duration <= 0)
            throw new Error('transitionTimeout must be positive');
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            controller.abort(new Error(`Transition timeout after ${duration}ms`));
          }, duration);
          let iterator: AsyncGenerator<StateFrame, void, unknown>;
          let returned = false;
          const finish = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            signal.removeEventListener('abort', finish);
            if (!returned && iterator) {
              returned = true;
              void iterator.return(undefined).catch(error => report(error, ctx));
            }
          };
          const onAbort = () => {
            if (!returned && iterator) {
              returned = true;
              void iterator.return(undefined).catch(error => report(error, ctx));
            }
          };
          signal.addEventListener('abort', onAbort, { once: true });
          cleanup = finish;
          const next = async () => {
            if (signal.aborted) throw signal.reason;
            let abort!: () => void;
            const aborted = new Promise<never>((_, reject) => {
              abort = () => reject(signal.reason);
              signal.addEventListener('abort', abort, { once: true });
            });
            try {
              return await Promise.race([iterator.next(), aborted]);
            } finally {
              signal.removeEventListener('abort', abort);
            }
          };
          try {
            iterator = handler(params, ctx);
            const first = await next();
            if (!first.done) {
              const validation = validateStateFrame(first.value);
              if (!validation.valid) throw new Error(`Invalid frame: ${validation.reason}`);
            }
            context.lock();
            let current: IteratorResult<StateFrame, void> | undefined = first;
            const encoder = new TextEncoder();
            let canceled = false;
            const stream = new ReadableStream<Uint8Array>(
              {
                async pull(target) {
                  try {
                    const frame = current ?? (await next());
                    current = undefined;
                    if (frame.done) {
                      target.close();
                      finish();
                      return;
                    }
                    const validation = validateStateFrame(frame.value);
                    if (!validation.valid) throw new Error(`Invalid frame: ${validation.reason}`);
                    target.enqueue(encoder.encode(encodeFrame(frame.value)));
                    if (frame.value.type === 'done' || frame.value.type === 'error') {
                      target.close();
                      finish();
                    }
                  } catch (error) {
                    if (canceled) {
                      finish();
                      return;
                    }
                    if (!request.signal.aborted) report(error, ctx);
                    if (!request.signal.aborted)
                      target.enqueue(
                        encoder.encode(
                          encodeFrame({
                            type: 'error',
                            message: timedOut
                              ? `Transition timeout after ${duration}ms`
                              : options.development
                                ? error instanceof Error
                                  ? error.message
                                  : 'Unknown server error'
                                : 'Transition failed',
                          })
                        )
                      );
                    target.close();
                    finish();
                  }
                },
                cancel() {
                  canceled = true;
                  controller.abort();
                  finish();
                },
              },
              { highWaterMark: 0 }
            );
            // Even without a consumer, request cancellation releases the generator/timer.
            signal.addEventListener('abort', finish, { once: true });
            streamOwnsCleanup = true;
            return new Response(stream, {
              headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' },
            });
          } catch (error) {
            context.discard();
            finish();
            report(error, ctx);
            if (request.signal.aborted) throw error;
            return new Response(
              encodeFrame({
                type: 'error',
                message: timedOut
                  ? `Transition timeout after ${duration}ms`
                  : options.development
                    ? error instanceof Error
                      ? error.message
                      : 'Unknown server error'
                    : 'Transition failed',
              }),
              { status: 500, headers: { 'content-type': 'application/x-ndjson' } }
            );
          }
        };
        const response = await sequence(...(options.middleware ?? []))(ctx, dispatch);
        const headers = new Headers(response.headers);
        context.lock();
        for (const value of context.outgoing) headers.append('set-cookie', value);
        if (options.security?.headers !== false) {
          headers.set('x-content-type-options', 'nosniff');
          headers.set('x-frame-options', 'SAMEORIGIN');
        }
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
