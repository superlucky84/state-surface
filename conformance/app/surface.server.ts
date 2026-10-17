import type { HandlerConfig } from 'state-surface/server';
import { counters } from './server/counters.server';

// The handler options of conformance/fixture.ts, used by dev and by the production entry.
export default {
  bodyLimit: 1024,
  limits: { timeout: 1000 },
  onError() {
    counters.errors++;
  },
  middleware: [
    async (ctx, next) => {
      const path = ctx.url.pathname.slice(ctx.basePath.length);
      if (path === '/early')
        return new Response('early', { status: 202, headers: { 'x-early': 'yes' } });
      if (path === '/aborts') return Response.json({ aborted: counters.aborted });
      if (path === '/errors') return Response.json({ errors: counters.errors });
      // DC-32: prerendered HTML passes the middleware, which may answer early.
      if (path === '/locked' && ctx.cookies.get('pass') !== '1')
        return new Response('locked', { status: 401 });
      const response = await next();
      const headers = new Headers(response.headers);
      headers.set('x-middleware', 'after');
      headers.set('x-route-kind', ctx.route.kind);
      headers.set('x-prerendered', String(ctx.route.prerendered));
      return new Response(response.body, { status: response.status, headers });
    },
  ],
} satisfies HandlerConfig;
