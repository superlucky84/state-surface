import { describe, it, expect, vi } from 'vitest';
import { h } from 'lithent';
import { createHandler } from './core/handler.js';
import { decodeFrames } from '../shared/ndjson.js';
import {
  defineTransition,
  TransitionError,
  type TransitionDefinition,
  type TransitionHandler,
} from './transition.js';
import type { HandlerOptions } from './core/handler.js';
import type { StateFrame, WireFrame } from '../shared/protocol.js';
import { defineManifest } from './core/manifest.js';

const ErrorBox = (props: { message: string }) => h('p', { class: 'error' }, props.message);
const Note = (props: { text?: string }) => h('p', {}, props.text ?? '');

function fixture(
  transitions: Record<
    string,
    TransitionHandler | (Omit<TransitionDefinition, 'handler'> & { handler: TransitionHandler })
  >,
  options: Partial<HandlerOptions> = {}
) {
  return createHandler({
    development: true,
    ...options,
    manifest: defineManifest({
      buildId: 'build-1',
      routes: [
        {
          pattern: '/',
          module: { default: () => null },
          page: {
            id: 'home',
            slots: {
              payload: { mode: 'client', componentId: 'payload#default' },
              b: { mode: 'client', componentId: 'b#default' },
              loading: { mode: 'client', componentId: 'loading#default' },
              note: { mode: 'server', componentId: 'note#default', component: Note },
              'system:error': { mode: 'server', componentId: 'error#default', component: ErrorBox },
            },
          },
        },
      ],
      transitions,
    }),
  });
}
const surfaceHeaders = { 'x-surface-build': 'build-1', 'x-surface-page': 'home' };
function post(
  path = '/transition/example',
  body: unknown = {},
  headers: Record<string, string> = {}
) {
  return new Request('https://surface.test' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...surfaceHeaders, ...headers },
    body: JSON.stringify(body),
  });
}
const frames = async (response: Response) => decodeFrames<WireFrame>(await response.text());
const valid: TransitionHandler = async function* (params) {
  yield { type: 'state', states: { payload: params, loading: {} } };
  yield {
    type: 'state',
    full: false,
    states: { b: { ok: true } },
    changed: ['b'],
    removed: ['loading'],
  };
};

describe('transition transport (DESIGN 6.2/6.3)', () => {
  it('streams a reset patch, later patches and an engine-sent done with security headers', async () => {
    const response = await fixture({
      example: { targets: ['payload', 'b', 'loading'], handler: valid },
    }).fetch(post(undefined, { q: 1 }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('ndjson');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await frames(response)).toEqual([
      {
        type: 'patch',
        reset: true,
        ops: [
          { slot: 'b', remove: true },
          { slot: 'payload', props: { q: 1 } },
          { slot: 'loading', props: {} },
          { slot: 'payload', ui: null },
          { slot: 'loading', ui: null },
        ],
      },
      {
        type: 'patch',
        ops: [
          { slot: 'loading', remove: true },
          { slot: 'b', props: { ok: true } },
        ],
      },
      { type: 'done' },
    ]);
  });

  it('answers an empty handler with done only (empty success)', async () => {
    const response = await fixture({ example: async function* () {} }).fetch(post());
    expect(await frames(response)).toEqual([{ type: 'done' }]);
  });

  it('answers an async function with one JSON response (full patch + done)', async () => {
    const response = await fixture({
      example: async () => ({ states: { note: { text: 'hi' } } }),
    }).fetch(post());
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      frames: [
        {
          type: 'patch',
          reset: true,
          ops: [
            { slot: 'note', html: '<p>hi</p>' },
            { slot: 'note', ui: null },
          ],
        },
        { type: 'done' },
      ],
    });
    const empty = await fixture({ example: async () => {} }).fetch(post());
    expect(await empty.json()).toEqual({ frames: [{ type: 'done' }] });
  });

  it('checks the build (409) before the page (400) and the name (404)', async () => {
    const handler = fixture({ example: valid });
    const mismatch = await handler.fetch(post(undefined, {}, { 'x-surface-build': 'old' }));
    expect(mismatch.status).toBe(409);
    expect(await mismatch.json()).toMatchObject({ buildId: 'build-1' });
    expect((await handler.fetch(post(undefined, {}, { 'x-surface-page': 'nope' }))).status).toBe(
      400
    );
    const noPage = new Request('https://surface.test/transition/example', {
      method: 'POST',
      headers: { 'x-surface-build': 'build-1' },
      body: '{}',
    });
    expect((await handler.fetch(noPage)).status).toBe(400);
    expect((await handler.fetch(post('/transition/unknown'))).status).toBe(404);
  });

  it('turns authoring violations into an error frame: detailed in development, generic in production', async () => {
    const handler: TransitionHandler = async function* () {
      yield { type: 'state', full: false, states: { payload: {} }, changed: ['payload'] };
    };
    const development = await frames(await fixture({ example: handler }).fetch(post()));
    expect(development).toEqual([
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining('frame #1: the first state frame must be a full frame'),
        slot: 'system:error',
      }),
    ]);
    const done = await frames(
      await fixture({
        example: async function* () {
          yield { type: 'state', states: { payload: {} } };
          yield { type: 'done' } as unknown as StateFrame;
        },
      }).fetch(post())
    );
    expect(done.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('engine sends it'),
    });
    const production = await frames(
      await fixture({ example: handler }, { development: false }).fetch(post())
    );
    expect(production[0]).toMatchObject({ type: 'error', message: 'Transition failed' });
  });

  it('reports stream errors, renders the error slot and hides internals in production', async () => {
    const onError = vi.fn();
    const response = await fixture(
      {
        example: async function* () {
          yield { type: 'state', states: { note: { text: 'a' } } };
          throw new Error('secret');
        },
      },
      { onError, development: false }
    ).fetch(post());
    expect(await frames(response)).toEqual([
      {
        type: 'patch',
        reset: true,
        ops: [
          { slot: 'note', html: '<p>a</p>' },
          { slot: 'note', ui: null },
        ],
      },
      {
        type: 'error',
        message: 'Transition failed',
        slot: 'system:error',
        html: '<p class="error">Transition failed</p>',
      },
    ]);
    expect(onError).toHaveBeenCalledTimes(1);
    const shown = await fixture(
      {
        example: async function* () {
          yield { type: 'state', states: { note: {} } };
          throw new TransitionError('Card "x" not found');
        },
      },
      { development: false }
    ).fetch(post());
    expect((await frames(shown)).at(-1)).toMatchObject({ message: 'Card "x" not found' });
  });

  it('times out before the first yield and discards pending cookies', async () => {
    const response = await fixture(
      {
        example: async function* (_, ctx) {
          ctx.cookies.set('leak', 'no');
          await new Promise(r => setTimeout(r, 60));
          yield { type: 'state', states: {} };
        },
      },
      { limits: { timeout: 10 } }
    ).fetch(post());
    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('Transition timeout');
  });

  it('ends a stream with an error after the idle or total timeout', async () => {
    const waiting: TransitionHandler = async function* (_, ctx) {
      yield { type: 'state', states: { note: {} } };
      await new Promise(resolve => ctx.signal.addEventListener('abort', resolve, { once: true }));
    };
    const total = await fixture({ example: waiting }, { limits: { timeout: 15 } }).fetch(post());
    expect((await frames(total)).at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('Transition timeout'),
    });
    const idle = await fixture({ example: waiting }, { limits: { idleTimeout: 15 } }).fetch(post());
    expect((await frames(idle)).at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('idle for more than 15ms'),
    });
  });

  it('ends the stream when a frame exceeds the line limit', async () => {
    const response = await fixture(
      {
        example: async function* () {
          yield { type: 'state', states: { payload: { text: 'x'.repeat(500) } } };
        },
      },
      { limits: { frameSize: 200 } }
    ).fetch(post());
    expect(await frames(response)).toEqual([
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining('exceeds 200 bytes'),
      }),
    ]);
  });

  it('marks action-level View Transitions with a response header (DC-06)', async () => {
    const response = await fixture({
      example: { viewTransition: true, handler: async () => ({ states: { note: {} } }) },
    }).fetch(post());
    expect(response.headers.get('x-surface-view-transition')).toBe('1');
  });

  it('enforces streamed bytes rather than trusting Content-Length', async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"q":"'));
        c.enqueue(new TextEncoder().encode('x'.repeat(50) + '"}'));
        c.close();
      },
    });
    const response = await fixture({ example: valid }, { bodyLimit: 16 }).fetch(
      new Request('https://surface.test/transition/example', {
        method: 'POST',
        headers: surfaceHeaders,
        body,
        duplex: 'half',
      } as RequestInit)
    );
    expect(response.status).toBe(413);
  });

  it('rejects malformed JSON and arrays', async () => {
    for (const body of ['{', '[]', 'null']) {
      const response = await fixture({ example: valid }).fetch(
        new Request('https://surface.test/transition/example', {
          method: 'POST',
          headers: surfaceHeaders,
          body,
        })
      );
      expect(response.status).toBe(400);
    }
  });

  it('checks Origin then Sec-Fetch-Site for every POST, including early middleware', async () => {
    const forbidden: Record<string, string>[] = [
      { origin: 'https://evil.test' },
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
      { origin: 'null' },
    ];
    for (const headers of forbidden)
      expect(
        (
          await fixture({ example: valid }, { middleware: [() => new Response('early')] }).fetch(
            post(undefined, {}, headers)
          )
        ).status
      ).toBe(403);
    expect(
      (
        await fixture({ example: valid }).fetch(
          post(undefined, {}, { origin: 'https://surface.test', 'x-trace-id': 'allowed' })
        )
      ).status
    ).toBe(200);
    expect(
      (
        await fixture(
          { example: valid },
          { security: { allowedOrigins: ['https://trusted.test'] } }
        ).fetch(post(undefined, {}, { origin: 'https://trusted.test' }))
      ).status
    ).toBe(200);
  });

  it('commits cookies before the first frame, ignores late writes, and supports deletion', async () => {
    const warn = vi.fn();
    const response = await fixture(
      {
        example: async function* (_, ctx) {
          ctx.cookies.set('a', 'first');
          ctx.cookies.delete('old');
          yield { type: 'state', states: {} };
          ctx.cookies.set('a', 'late');
        },
      },
      { logger: { level: 'warn', warn, debug: vi.fn(), info: vi.fn(), error: vi.fn() } }
    ).fetch(post());
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get('set-cookie')).toContain('a=first');
    await response.text();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('closes a cooperative generator when a Request is aborted', async () => {
    const closed = vi.fn();
    const controller = new AbortController();
    const response = await fixture({
      example: async function* (_, ctx) {
        try {
          yield { type: 'state', states: {} };
          await new Promise(resolve =>
            ctx.signal.addEventListener('abort', resolve, { once: true })
          );
          yield { type: 'state', full: false, states: {}, removed: ['b'] };
        } finally {
          closed();
        }
      },
    }).fetch(
      new Request('https://surface.test/transition/example', {
        method: 'POST',
        headers: surfaceHeaders,
        body: '{}',
        signal: controller.signal,
      })
    );
    const reader = response.body!.getReader();
    await reader.read();
    const pending = reader.read();
    controller.abort();
    await pending.catch(() => {});
    await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
  });

  it('discards cookies when a generator throws before the first frame', async () => {
    const response = await fixture({
      example: async function* (_, ctx) {
        ctx.cookies.set('secret', 'discard');
        throw new Error('failed before yield');
      },
    }).fetch(post());
    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('failed before yield');
  });

  it('cancels an in-flight body read and releases the generator', async () => {
    const closed = vi.fn();
    const response = await fixture({
      example: async function* (_, ctx) {
        try {
          yield { type: 'state', states: {} };
          await new Promise(resolve =>
            ctx.signal.addEventListener('abort', resolve, { once: true })
          );
        } finally {
          closed();
        }
      },
    }).fetch(post());
    const reader = response.body!.getReader();
    await reader.read();
    const pending = reader.read();
    await reader.cancel();
    expect(await pending).toEqual({ value: undefined, done: true });
    await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
  });

  it('exposes ctx.external() inside transitions only', async () => {
    const response = await fixture({
      example: async function* (_, ctx) {
        yield { type: 'state', states: { payload: {} } };
        yield* ctx.external([{ type: 'state', accumulate: true, states: { payload: { x: 1 } } }]);
      },
    }).fetch(post());
    // payload is not an external slot: the frame is dropped and the transition completes.
    expect((await frames(response)).map(frame => frame.type)).toEqual(['patch', 'done']);
  });
});
