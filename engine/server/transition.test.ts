import { describe, it, expect, vi } from 'vitest';
import { createHandler } from './core/handler.js';
import { decodeFrames } from '../shared/ndjson.js';
import type { TransitionHandler } from './transition.js';
import type { HandlerOptions } from './core/handler.js';

function fixture(
  transitions: Record<string, TransitionHandler>,
  options: Partial<HandlerOptions> = {}
) {
  return createHandler({
    development: true,
    ...options,
    manifest: { routes: [], templates: {}, transitions },
  });
}
function post(
  path = '/transition/example',
  body: unknown = {},
  headers: Record<string, string> = {}
) {
  return new Request('https://surface.test' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
const valid: TransitionHandler = async function* (params) {
  yield { type: 'state', states: { payload: params } };
  yield {
    type: 'state',
    full: false,
    states: { b: { ok: true } },
    changed: ['b'],
    removed: ['loading'],
  };
  yield { type: 'done' };
};

describe('web transition transport', () => {
  it('streams full, partial, removed and done frames with security headers', async () => {
    const response = await fixture({ example: valid }).fetch(post(undefined, { q: 1 }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('ndjson');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const frames = decodeFrames(await response.text());
    expect(frames).toHaveLength(3);
    expect(frames[0]).toMatchObject({ type: 'state', states: { payload: { q: 1 } } });
    expect(frames[1]).toMatchObject({ full: false, removed: ['loading'] });
    expect(frames[2].type).toBe('done');
  });
  it('returns 404 for unknown names and isolates handler manifests', async () => {
    expect((await fixture({}).fetch(post())).status).toBe(404);
    expect((await fixture({ example: valid }).fetch(post())).status).toBe(200);
  });
  it('rejects invalid frames without forwarding them', async () => {
    const response = await fixture({
      example: async function* () {
        yield { type: 'state', full: false, states: { a: 1 } } as any;
      },
    }).fetch(post());
    expect(decodeFrames(await response.text())).toEqual([
      expect.objectContaining({ type: 'error', message: expect.stringContaining('Invalid frame') }),
    ]);
  });
  it('reports stream errors through onError and hides internals in production', async () => {
    const onError = vi.fn();
    const response = await fixture(
      {
        example: async function* () {
          yield { type: 'state', states: {} };
          throw new Error('secret');
        },
      },
      { onError, development: false }
    ).fetch(post());
    expect(decodeFrames(await response.text())).toEqual([
      { type: 'state', states: {} },
      { type: 'error', message: 'Transition failed' },
    ]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
  it('times out before the first yield and discards pending cookies', async () => {
    const response = await fixture(
      {
        example: async function* (_, ctx) {
          ctx.cookies.set('leak', 'no');
          await new Promise(r => setTimeout(r, 60));
          yield { type: 'done' };
        },
      },
      { transitionTimeout: 10 }
    ).fetch(post());
    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('Transition timeout');
  });
  it('times out after a frame and closes the stream', async () => {
    const response = await fixture(
      {
        example: async function* (_, ctx) {
          yield { type: 'state', states: {} };
          await new Promise(resolve =>
            ctx.signal.addEventListener('abort', resolve, { once: true })
          );
          yield { type: 'done' };
        },
      },
      { transitionTimeout: 15 }
    ).fetch(post());
    expect(decodeFrames(await response.text()).at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('timeout'),
    });
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
        body,
        duplex: 'half',
      } as RequestInit)
    );
    expect(response.status).toBe(413);
  });
  it('rejects malformed JSON and arrays', async () => {
    for (const body of ['{', '[]', 'null']) {
      const response = await fixture({ example: valid }).fetch(
        new Request('https://surface.test/transition/example', { method: 'POST', body })
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
  it('commits cookies before first yield, ignores late writes, and supports deletion', async () => {
    const warn = vi.fn();
    const response = await fixture(
      {
        example: async function* (_, ctx) {
          ctx.cookies.set('a', 'first');
          ctx.cookies.delete('old');
          yield { type: 'state', states: {} };
          ctx.cookies.set('a', 'late');
          yield { type: 'done' };
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
          yield { type: 'done' };
        } finally {
          closed();
        }
      },
    }).fetch(
      new Request('https://surface.test/transition/example', {
        method: 'POST',
        body: '{}',
        signal: controller.signal,
      })
    );
    const reader = response.body!.getReader();
    await reader.read();
    const pending = reader.read();
    controller.abort();
    await pending;
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
          yield { type: 'done' };
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
});
