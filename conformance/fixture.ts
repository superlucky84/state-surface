import { h } from 'lithent';
import type { HandlerOptions } from '../engine/server/core/handler.js';
import { Island, Slot } from '../engine/shared/surfaceTree.js';

const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  h(tag as never, props as never, ...(children as never[]));
const Fixture = (props: { value: unknown }) => h('p', {}, String(props.value));
// Compiled form of <Slot name="fixture:state" client:load><Fixture {...props} /></Slot>.
const state = (
  props: Record<string, unknown>,
  directives: Record<string, unknown> = { 'client:load': true }
) =>
  el(
    Slot,
    { name: 'fixture:state', ...directives },
    el(Island, { __ssComponent: Fixture, __ssId: 'conformance/Fixture.tsx#default', ...props })
  );
const documentOf = (body: unknown) =>
  el('html', {}, el('head', {}, el('title', {}, 'Fixture')), el('body', {}, body));

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
      document: {
        engine: {
          loader: '/assets/probe-12345678.js',
          runtime: '/assets/runtime.js',
          bridge: '/assets/bridge.js',
        },
      },
      routes: [
        {
          pattern: '/',
          module: {
            default: ctx =>
              documentOf(
                state({
                  value: 'Hello',
                  runtime: ctx.env.RUNTIME ?? 'unknown',
                  cookie: ctx.cookies.get('lang') ?? '',
                  nonce: ctx.nonce,
                })
              ),
          },
        },
        {
          // No directive: a static slot, so the page needs no engine script (V-01).
          pattern: '/static',
          module: { default: () => documentOf(state({ value: 'static' }, {})) },
        },
        {
          pattern: '/dynamic/:id',
          module: { default: ctx => documentOf(state({ value: ctx.params.id })) },
        },
        {
          pattern: '/failure',
          module: {
            default() {
              throw new Error('secret-render-detail');
            },
          },
        },
      ],
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
