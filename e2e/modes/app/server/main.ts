import manifest from 'virtual:state-surface/manifest';
import { serve } from 'state-surface/adapters/node';
import type { Middleware } from 'state-surface/server';

// Nonce-based CSP with 'strict-dynamic' on every page (V-30: no violations from the engine,
// the router or a tag manager that propagates the nonce).
const csp: Middleware = async (ctx, next) => {
  const response = await next();
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set(
    'content-security-policy',
    `script-src 'nonce-${ctx.nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'self'`
  );
  return new Response(response.body, { status: response.status, headers });
};

serve({ manifest, middleware: [csp] });
