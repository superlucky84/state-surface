import type { HandlerConfig, Middleware } from 'state-surface/server';

// Nonce-based CSP with 'strict-dynamic' on every page (V-30: no violations from the engine,
// the router or a tag manager that propagates the nonce).
const csp: Middleware = async (ctx, next) => {
  const response = await next();
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response;
  const headers = new Headers(response.headers);
  // Prerendered HTML is built once: no per-request nonce, so it allows its own scripts (DC-32).
  headers.set(
    'content-security-policy',
    ctx.route.prerendered
      ? "script-src 'self'; object-src 'none'; base-uri 'self'"
      : `script-src 'nonce-${ctx.nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'self'`
  );
  headers.set('x-prerendered', String(ctx.route.prerendered));
  return new Response(response.body, { status: response.status, headers });
};

// Middleware also guards prerendered pages: an early response replaces the built HTML.
const guard: Middleware = (ctx, next) =>
  ctx.url.pathname === '/pre/two' && ctx.cookies.get('pass') !== '1'
    ? new Response('Unauthorized', { status: 401 })
    : next();

// Shared by `vite` dev and the production entry (server/main.ts).
export default { middleware: [guard, csp] } satisfies HandlerConfig;
