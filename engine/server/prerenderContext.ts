import type { SurfaceContext } from './core/context.js';

/**
 * A prerendered page reads a request-dependent part of the context (DC-24 ③). The HTML is
 * built once and served to every request, so cookies, headers, locals, flash and the CSP
 * nonce do not exist while it renders.
 */
export class PrerenderAccessError extends Error {
  constructor(
    readonly property: string,
    readonly path: string
  ) {
    super(
      `${property} is not available while prerendering ${path}: the HTML is built once for ` +
        'every request. Read it in a deferred server slot (server:defer) or set ' +
        '`export const prerender = false` on the page.'
    );
    this.name = 'PrerenderAccessError';
  }
}

/**
 * The context a prerendered page renders with: request-dependent members throw. Middleware
 * keeps the full context (it runs per request, DC-32); only the page sees this view.
 */
export function prerenderView(ctx: SurfaceContext): SurfaceContext {
  const path = ctx.url.pathname + ctx.url.search;
  const deny = (property: string): never => {
    throw new PrerenderAccessError(property, path);
  };
  const request = new Request(ctx.request.url);
  Object.defineProperty(request, 'headers', { get: () => deny('ctx.request.headers') });
  const view = Object.create(ctx) as SurfaceContext;
  Object.defineProperties(view, {
    request: { value: request },
    cookies: { get: () => deny('ctx.cookies') },
    locals: { get: () => deny('ctx.locals') },
    nonce: { get: () => deny('ctx.nonce') },
    flash: { value: () => deny('ctx.flash()') },
  });
  return view;
}

/** The engine's own tags: a prerendered page has no per-request nonce. */
export function nonceOf(ctx: SurfaceContext): string {
  return ctx.route.prerendered ? '' : ctx.nonce;
}

/** `/` → `index.html`, `/en/guide/a` → `en/guide/a/index.html` (decoded segments). */
export function prerenderFile(segments: readonly string[]): string | undefined {
  if (segments.some(s => !s || s.includes('/') || s.includes('\\') || s.startsWith('.')))
    return undefined;
  return [...segments, 'index.html'].join('/');
}
