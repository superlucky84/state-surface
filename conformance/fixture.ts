import { h } from 'lithent';
import type { HandlerOptions } from '../engine/server/core/handler.js';
import { Island, Slot } from '../engine/shared/surfaceTree.js';
import { defineServerComponent } from '../engine/server/serverComponent.js';

const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  h(tag as never, props as never, ...(children as never[]));
const Fixture = (props: { value: unknown }) => h('p', {}, String(props.value));
const Html = (props: { text?: string }) => h('p', { class: 'html' }, props.text ?? '');
const ErrorBox = (props: { message: string }) => h('p', { class: 'error' }, props.message);
// Deferred server component: `load` sees the island request (cookies, env) of the runtime.
const Deferred = defineServerComponent({
  load: (props: { label: string }, ctx) => ({
    label: props.label,
    runtime: String(ctx.env.RUNTIME ?? 'unknown'),
    cookie: ctx.cookies.get('lang') ?? '',
  }),
  render: (data: { label: string; runtime: string; cookie: string }) =>
    h('p', { class: 'deferred' }, `${data.label}@${data.runtime}:${data.cookie}`),
});
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
const documentOf = (...body: unknown[]) =>
  el('html', {}, el('head', {}, el('title', {}, 'Fixture')), el('body', {}, ...body));
// The page manifest the build would generate for the index page (DESIGN 6.2).
const slots = {
  'fixture:state': { mode: 'client' as const, componentId: 'conformance/Fixture.tsx#default' },
  value: { mode: 'client' as const, componentId: 'conformance/Value.tsx#default' },
  'fixture:html': {
    mode: 'server' as const,
    componentId: 'conformance/Html.tsx#default',
    component: Html,
  },
  'system:error': {
    mode: 'server' as const,
    componentId: 'conformance/ErrorBox.tsx#default',
    component: ErrorBox,
  },
};

export function fixture(basePath = '/demo'): HandlerOptions {
  let aborted = 0;
  let errors = 0;
  return {
    basePath,
    bodyLimit: 1024,
    limits: { timeout: 1000 },
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
        headers.set('x-route-kind', ctx.route.kind);
        return new Response(response.body, { status: response.status, headers });
      },
    ],
    manifest: {
      buildId: 'conformance-build',
      // Build-generated secret stand-in (≥ 32 bytes) for the deferred slot token (IC-09).
      secret: 'conformance-fixture-secret-0123456789abcdef',
      components: { 'conformance/Deferred.tsx#default': Deferred },
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
          page: { id: 'index', slots },
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
          page: { id: 'static', slots: {} },
          module: { default: () => documentOf(state({ value: 'static' }, {})) },
        },
        {
          pattern: '/deferred',
          page: { id: 'deferred', slots: {} },
          module: {
            default: () =>
              documentOf(
                el(
                  Slot,
                  {
                    name: 'fixture:defer',
                    mode: 'server',
                    'server:defer': true,
                    cache: 'public, max-age=60',
                    fallback: el('p', {}, 'Loading'),
                  },
                  el(Island, {
                    __ssComponent: Deferred,
                    __ssId: 'conformance/Deferred.tsx#default',
                    label: 'secret-label',
                  })
                )
              ),
          },
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
        stream: {
          handler: async function* (_, ctx) {
            ctx.cookies.set('first', 'yes', { httpOnly: true });
            ctx.cookies.set('second', 'also');
            yield { type: 'state', states: { value: { n: 1 } } };
            await new Promise(r => setTimeout(r, 150));
            ctx.cookies.set('late', 'ignored');
            yield { type: 'state', full: false, states: { value: { n: 2 } }, changed: ['value'] };
          },
        },
        abort: {
          handler: async function* (_, ctx) {
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
        },
        // Server slot projection: the state is rendered to an `html` op on every runtime.
        echo: {
          handler: async (input, ctx) => ({
            states: {
              'fixture:html': {
                text: JSON.stringify({
                  input,
                  kind: ctx.route.kind,
                  env: ctx.env.RUNTIME ?? 'unknown',
                }),
              },
            },
          }),
        },
        fail: {
          handler: async function* () {
            yield { type: 'state', states: { value: { n: 0 } } };
            throw new Error('secret-transition-detail');
          },
        },
      },
    },
  };
}
