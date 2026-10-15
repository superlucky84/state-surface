import { h } from 'lithent';
import type { HandlerOptions } from '../engine/server/core/handler.js';

export function fixture(basePath = '/demo'): HandlerOptions {
  let aborted = 0;
  let errors = 0;
  return {
    basePath,
    bodyLimit: 1024,
    transitionTimeout: 1000,
    development: false,
    onError() {
      errors++;
    },
    middleware: [
      async (ctx, next) => {
        if (ctx.url.pathname === basePath + '/early')
          return new Response('early', { status: 202, headers: { 'x-early': 'yes' } });
        if (ctx.url.pathname === basePath + '/aborts') return Response.json({ aborted });
        if (ctx.url.pathname === basePath + '/errors') return Response.json({ errors });
        const response = await next();
        const headers = new Headers(response.headers);
        headers.set('x-middleware', 'after');
        return new Response(response.body, { status: response.status, headers });
      },
    ],
    manifest: {
      routes: [
        {
          pattern: '/',
          module: {
            layout: s =>
              `<!DOCTYPE html><html><head><title>Fixture</title></head><body><h-state name="fixture:state"></h-state>${s}</body></html>`,
            initial: ctx => ({
              'fixture:state': {
                value: 'Hello',
                runtime: ctx.env.RUNTIME ?? 'unknown',
                cookie: ctx.cookies.get('lang') ?? '',
                nonce: ctx.nonce,
              },
            }),
          },
        },
        {
          pattern: '/dynamic/:id',
          module: {
            layout: s => `<h-state name="fixture:state"></h-state>${s}`,
            initial: ctx => ({ 'fixture:state': { value: ctx.params.id } }),
          },
        },
        {
          pattern: '/failure',
          module: {
            layout() {
              throw new Error('secret-render-detail');
            },
          },
        },
      ],
      templates: { 'fixture:state': props => h('p', {}, String(props.value)) },
      transitions: {
        stream: async function* (_, ctx) {
          ctx.cookies.set('first', 'yes', { httpOnly: true });
          ctx.cookies.set('second', 'also');
          yield { type: 'state', states: { value: { n: 1 } } };
          await new Promise(r => setTimeout(r, 150));
          ctx.cookies.set('late', 'ignored');
          yield { type: 'state', full: false, states: { value: { n: 2 } }, changed: ['value'] };
          yield { type: 'done' };
        },
        abort: async function* (_, ctx) {
          try {
            yield { type: 'state', states: {} };
            await new Promise<void>(resolve => {
              if (ctx.signal.aborted) resolve();
              else ctx.signal.addEventListener('abort', () => resolve(), { once: true });
            });
          } finally {
            aborted++;
          }
        },
        echo: async function* (input, ctx) {
          yield {
            type: 'state',
            states: { input, kind: ctx.route.kind, env: ctx.env.RUNTIME ?? 'unknown' },
          };
          yield { type: 'done' };
        },
      },
    },
  };
}
