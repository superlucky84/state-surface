import { describe, it, expect } from 'vitest';
import { createHandler } from './handler.js';
import { defineManifest } from './manifest.js';

describe('request context and middleware', () => {
  it('isolates concurrent locals, env, cookies and nonce and exposes route kind', async () => {
    const handler = createHandler({
      manifest: {
        routes: [
          {
            pattern: '/:id',
            module: {
              layout: (_, ctx) =>
                JSON.stringify({
                  params: ctx.params,
                  locals: ctx.locals,
                  env: ctx.env,
                  cookie: ctx.cookies.get('value'),
                  nonce: ctx.nonce,
                  kind: ctx.route.kind,
                }),
              initial: async ctx => {
                await new Promise(resolve =>
                  setTimeout(resolve, ctx.params.id === 'slow' ? 10 : 0)
                );
                return {};
              },
            },
          },
        ],
        transitions: {},
        templates: {},
      },
      middleware: [
        async (ctx, next) => {
          Object.assign(ctx.locals, { id: ctx.params.id });
          ctx.cookies.set('reply', ctx.params.id);
          return next();
        },
      ],
    });
    const [slow, fast] = await Promise.all(
      ['slow', 'fast'].map(id =>
        handler.fetch(
          new Request('https://surface.test/' + id, { headers: { cookie: 'value=' + id } }),
          { env: { ID: id } }
        )
      )
    );
    const a = JSON.parse(await slow.text()),
      b = JSON.parse(await fast.text());
    expect(a).toMatchObject({
      params: { id: 'slow' },
      locals: { id: 'slow' },
      env: { ID: 'slow' },
      cookie: 'slow',
      kind: 'page',
    });
    expect(b.cookie).toBe('fast');
    expect(a.nonce).not.toBe(b.nonce);
    expect(slow.headers.get('set-cookie')).toContain('reply=slow');
    expect(fast.headers.get('set-cookie')).toContain('reply=fast');
  });
  it('runs onion middleware and permits early return and response decoration', async () => {
    const calls: string[] = [];
    const handler = createHandler({
      manifest: { routes: [], transitions: {}, templates: {} },
      middleware: [
        async (_, next) => {
          calls.push('a');
          const response = await next();
          calls.push('d');
          response.headers.set('x-after', 'yes');
          return response;
        },
        async () => {
          calls.push('b');
          return new Response('early', { status: 202 });
        },
      ],
    });
    const response = await handler.fetch(new Request('https://surface.test/'));
    expect(calls).toEqual(['a', 'b', 'd']);
    expect(response.status).toBe(202);
    expect(response.headers.get('x-after')).toBe('yes');
  });
  it('rejects duplicate next calls rather than dispatching a request twice', async () => {
    const handler = createHandler({
      development: true,
      manifest: { routes: [], transitions: {}, templates: {} },
      middleware: [
        async (_, next) => {
          await next();
          return next();
        },
      ],
    });
    const response = await handler.fetch(new Request('https://surface.test/'));
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('next() called more than once');
  });
  it('rejects duplicate manifests before accepting requests', () => {
    expect(() =>
      defineManifest({
        routes: [],
        templates: [],
        transitions: [
          { name: 'same', handler: async function* () {} },
          { name: 'same', handler: async function* () {} },
        ],
      })
    ).toThrow('Duplicate');
  });
});
