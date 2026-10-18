import type { HandlerConfig, Middleware } from 'state-surface/server';
import { datadogItems, records, sentryItems, traceHeaders } from './server/intake.server';

// Nonce CSP with 'strict-dynamic' (GTM, the Sentry Loader and the Datadog snippet add their
// scripts from the nonced snippets); SDK data goes to this origin only.
const csp: Middleware = async (ctx, next) => {
  const response = await next();
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set(
    'content-security-policy',
    `script-src 'nonce-${ctx.nonce}' 'strict-dynamic'; connect-src 'self'; object-src 'none'; base-uri 'self'`
  );
  return new Response(response.body, { status: response.status, headers });
};

const intake: Middleware = async (ctx, next) => {
  const { pathname } = ctx.url;
  const cors = { 'access-control-allow-origin': '*' };
  if (pathname === '/intake/records')
    return Response.json(records, { headers: { 'cache-control': 'no-store' } });
  if (pathname === '/intake/reset') {
    records.length = 0;
    return new Response(null, { status: 204 });
  }
  if (pathname.startsWith('/intake/api/')) {
    records.push({ kind: 'sentry', path: pathname, items: sentryItems(await ctx.request.text()) });
    return Response.json({}, { headers: cors });
  }
  if (pathname === '/intake/datadog') {
    records.push({
      kind: 'datadog',
      path: ctx.url.searchParams.get('ddforward') ?? '',
      items: datadogItems(await ctx.request.text()),
    });
    return new Response(null, { status: 202, headers: cors });
  }
  // Engine requests: transitions and the router's page fetches (not document loads) carry
  // the SDKs' trace headers.
  const routerFetch =
    ctx.route.kind === 'page' && ctx.request.headers.get('sec-fetch-mode') === 'cors';
  if (ctx.route.kind === 'transition' || routerFetch)
    records.push({ kind: 'request', path: pathname, headers: traceHeaders(ctx.request) });
  return next();
};

export default {
  middleware: [intake, csp],
  onError(error, ctx) {
    records.push({
      kind: 'server-error',
      path: ctx.url.pathname,
      message: error instanceof Error ? error.message : String(error),
      headers: traceHeaders(ctx.request),
    });
  },
} satisfies HandlerConfig;
