import { describe, it, expect, vi } from 'vitest';
import { h } from 'lithent';
import { createHandler, type HandlerOptions } from './core/handler.js';
import { defineManifest } from './core/manifest.js';
import { defineTransition, TransitionError } from './transition.js';
import { openFlash, redirectTarget, sealFlash } from './flash.js';
import { validateSchema, type StandardSchema } from '../shared/schema.js';
import { actionPath, actionUrl, type ActionName } from '../shared/actions.js';
import { setBasePath } from '../shared/basePath.js';
import type { SurfaceContext } from './core/context.js';
import type { WireFrame } from '../shared/protocol.js';

const SECRET = 's'.repeat(32);
const ORIGIN = 'https://surface.test';

/** Minimal Standard Schema: `body` must be a non-empty string, `tags` optional. */
const commentSchema: StandardSchema<
  { postId: string; body: string; tags?: string[] },
  { postId: string; body: string; tags: string[] }
> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate(value) {
      const input = value as Record<string, unknown>;
      const issues: Array<{ message: string; path: string[] }> = [];
      if (typeof input.postId !== 'string') issues.push({ message: 'Required', path: ['postId'] });
      if (typeof input.body !== 'string' || !input.body)
        issues.push({ message: 'Required', path: ['body'] });
      if (issues.length) return { issues };
      const tags = input.tags === undefined ? [] : ([] as string[]).concat(input.tags as string[]);
      return { value: { postId: input.postId as string, body: input.body as string, tags } };
    },
  },
};

const ErrorBox = (props: { message: string; fieldErrors?: Record<string, string[]> }) =>
  h('p', { class: 'error' }, props.message);

function fixture(options: Partial<HandlerOptions> = {}) {
  const calls: unknown[] = [];
  const handler = createHandler({
    development: false,
    secret: SECRET,
    ...options,
    manifest: defineManifest({
      buildId: 'build-1',
      routes: [
        {
          pattern: '/post',
          module: {
            default: async (ctx: SurfaceContext) => {
              const flash = await ctx.flash('comment/add');
              return h(
                'html',
                {},
                h('head', {}),
                h('body', {}, h('pre', { id: 'flash' }, JSON.stringify(flash ?? null)))
              );
            },
          },
          page: {
            id: 'post',
            slots: {
              'comments:list': { mode: 'client', componentId: 'list#default' },
              'system:error': { mode: 'server', componentId: 'error#default', component: ErrorBox },
            },
          },
        },
      ],
      transitions: {
        'comment/add': defineTransition({
          input: commentSchema,
          targets: ['comments:list'],
          flash: { input: ['body', 'attachment'] },
          async *handler(input) {
            calls.push(input);
            if (input.body === 'explode') throw new Error('database down');
            if (input.body === 'refuse') throw new TransitionError('Comments are closed');
            yield { type: 'state', states: { 'comments:list': { items: [input.body] } } };
          },
        }),
        queue: defineTransition({ mode: 'queue', handler: async () => ({ states: {} }) }),
        plain: async function* () {},
      },
    }),
  });
  return { handler, calls };
}

const form = (fields: Record<string, string | string[]>) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields))
    for (const item of ([] as string[]).concat(value)) body.append(key, item);
  return body;
};
const surfaceHeaders = { 'x-surface-build': 'build-1', 'x-surface-page': 'post' };
const flashCookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .find(cookie => cookie.startsWith('surface_flash='))
    ?.split(';')[0];

describe('typed transitions (DC-22 ①②)', () => {
  it('validates params with the input schema before the handler runs (422)', async () => {
    const { handler, calls } = fixture();
    const response = await handler.fetch(
      new Request(`${ORIGIN}/transition/comment/add`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...surfaceHeaders },
        body: JSON.stringify({ postId: 'p1', body: '' }),
      })
    );
    expect(response.status).toBe(422);
    const { frames } = (await response.json()) as { frames: WireFrame[] };
    expect(frames).toEqual([
      {
        type: 'error',
        kind: 'validation',
        message: 'Invalid input (body: Required)',
        fieldErrors: { body: ['Required'] },
        slot: 'system:error',
        html: '<p class="error">Invalid input (body: Required)</p>',
      },
    ]);
    expect(calls).toEqual([]);
  });

  it('turns form-urlencoded and multipart bodies into objects (repeated names → arrays)', async () => {
    const { handler, calls } = fixture();
    const urlencoded = await handler.fetch(
      new Request(`${ORIGIN}/transition/comment/add`, {
        method: 'POST',
        headers: { ...surfaceHeaders, 'content-type': 'application/x-www-form-urlencoded' },
        body: form({ postId: 'p1', body: 'hi', tags: ['a', 'b'], _redirect: '/post' }),
      })
    );
    expect(urlencoded.status).toBe(200);
    await urlencoded.text();
    const multipart = new FormData();
    multipart.append('postId', 'p2');
    multipart.append('body', 'with file');
    multipart.append('tags', 'x');
    multipart.append('attachment', new File(['data'], 'a.txt', { type: 'text/plain' }));
    const response = await handler.fetch(
      new Request(`${ORIGIN}/transition/comment/add`, {
        method: 'POST',
        headers: surfaceHeaders,
        body: multipart,
      })
    );
    await response.text();
    expect(calls).toEqual([
      { postId: 'p1', body: 'hi', tags: ['a', 'b'] },
      { postId: 'p2', body: 'with file', tags: ['x'] },
    ]);
  });

  it('routes multi-segment names and sends targets and queue mode in the bootstrap', async () => {
    const { handler } = fixture();
    const missing = await handler.fetch(
      new Request(`${ORIGIN}/transition/comment/remove`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...surfaceHeaders },
        body: '{}',
      })
    );
    expect(missing.status).toBe(404);
    expect(() =>
      defineManifest({ routes: [], transitions: { 'Comment/Add': async function* () {} } })
    ).toThrow('kebab-case');
  });
});

describe('JS-less form submission (DC-22 ③, PRG)', () => {
  const submit = (
    handler: ReturnType<typeof fixture>['handler'],
    body: BodyInit,
    headers: Record<string, string> = {},
    path = '/_surface/action/comment/add'
  ) =>
    handler.fetch(
      new Request(ORIGIN + path, {
        method: 'POST',
        headers: { origin: ORIGIN, referer: `${ORIGIN}/post?id=1`, ...headers },
        body,
      })
    );

  it('runs the transition, drops its frames and answers 303 with a one-time flash', async () => {
    const { handler, calls } = fixture();
    const response = await submit(handler, form({ postId: 'p1', body: 'hello' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/post?id=1');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(calls).toEqual([{ postId: 'p1', body: 'hello', tags: [] }]);
    const setCookie = response.headers.getSetCookie().find(c => c.startsWith('surface_flash='))!;
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Max-Age=60/);
    expect(setCookie).toMatch(/Secure/);

    const page = await handler.fetch(
      new Request(`${ORIGIN}/post?id=1`, { headers: { cookie: flashCookie(response)! } })
    );
    const html = await page.text();
    expect(html).toContain(
      `<pre id="flash">${JSON.stringify({ ok: true, input: { body: 'hello' } })}</pre>`
    );
    // Read once: the page deletes the cookie.
    expect(page.headers.getSetCookie().some(c => /^surface_flash=;.*Max-Age=0/.test(c))).toBe(true);
  });

  it('returns validation errors and only the opted-in input fields, never files', async () => {
    const { handler, calls } = fixture();
    const multipart = new FormData();
    multipart.append('postId', 'p1');
    multipart.append('body', '');
    multipart.append('secret', 'hunter2');
    multipart.append('attachment', new File(['data'], 'a.txt'));
    const response = await submit(handler, multipart);
    expect(response.status).toBe(303);
    expect(calls).toEqual([]);
    const flash = await openFlash(
      { current: SECRET },
      decodeURIComponent(flashCookie(response)!.slice('surface_flash='.length))
    );
    expect(flash).toEqual({
      n: 'comment/add',
      ok: false,
      error: {
        message: 'Invalid input (body: Required)',
        kind: 'validation',
        fieldErrors: { body: ['Required'] },
      },
      input: { body: '' },
    });
  });

  it('keeps TransitionError messages and hides other server errors in production', async () => {
    const { handler } = fixture({
      logger: { level: 'info', info() {}, warn() {}, error() {}, debug() {} },
    });
    const read = async (response: Response) =>
      openFlash(
        { current: SECRET },
        decodeURIComponent(flashCookie(response)!.slice('surface_flash='.length))
      );
    const closed = await read(await submit(handler, form({ postId: 'p', body: 'refuse' })));
    expect(closed?.error).toEqual({ message: 'Comments are closed', kind: 'server' });
    const crashed = await read(await submit(handler, form({ postId: 'p', body: 'explode' })));
    expect(crashed?.error).toEqual({ message: 'Transition failed', kind: 'server' });
  });

  it('only redirects to same-origin paths inside BASE_PATH', async () => {
    const { handler } = fixture({ basePath: '/demo' });
    const target = async (fields: Record<string, string>, referer?: string) =>
      (
        await handler.fetch(
          new Request(`${ORIGIN}/demo/_surface/action/plain`, {
            method: 'POST',
            headers: {
              origin: ORIGIN,
              'content-type': 'application/x-www-form-urlencoded',
              ...(referer ? { referer } : {}),
            },
            body: form(fields),
          })
        )
      ).headers.get('location');
    expect(await target({ _redirect: '/demo/post?x=1' })).toBe('/demo/post?x=1');
    expect(await target({ _redirect: '//evil.test/x' }, `${ORIGIN}/demo/from`)).toBe('/demo/from');
    expect(await target({ _redirect: '/\\evil.test' })).toBe('/demo/');
    expect(await target({ _redirect: 'https://evil.test/' })).toBe('/demo/');
    expect(await target({ _redirect: '/other' }, 'https://evil.test/demo/x')).toBe('/demo/');
    expect(await target({})).toBe('/demo/');
    expect(redirectTarget('/a', null, ORIGIN, '')).toBe('/a');
    expect(redirectTarget('/a\u0000b', null, ORIGIN, '')).toBe('/');
  });

  it('rejects cross-origin submissions and unknown actions', async () => {
    const { handler } = fixture();
    expect((await submit(handler, form({}), { origin: 'https://evil.test' })).status).toBe(403);
    expect((await submit(handler, form({}), {}, '/_surface/action/comment/missing')).status).toBe(
      404
    );
  });

  it('shrinks a flash over the size limit: input first, then field errors (dev warning)', async () => {
    const warn = vi.fn();
    const { handler } = fixture({
      development: true,
      flashLimit: 400,
      logger: { level: 'info', info() {}, warn, error() {}, debug() {} },
    });
    const response = await submit(handler, form({ postId: 'p', body: 'x'.repeat(500) }));
    const flash = await openFlash(
      { current: SECRET },
      decodeURIComponent(flashCookie(response)!.slice('surface_flash='.length))
    );
    expect(flash).toEqual({ n: 'comment/add', ok: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropped input'));

    const errors = {
      ok: false,
      error: { message: 'm', kind: 'validation' as const, fieldErrors: { a: ['x'.repeat(400)] } },
    };
    const sealed = await sealFlash({ current: SECRET }, 'n', errors, 300);
    expect(sealed.trimmed).toEqual(['fieldErrors']);
  });

  it('ignores tampered flash cookies, other names, and verifies with the previous secret', async () => {
    const { value } = await sealFlash({ current: SECRET }, 'comment/add', { ok: true }, 3000);
    expect(await openFlash({ current: 'o'.repeat(32), previous: SECRET }, value)).toEqual({
      n: 'comment/add',
      ok: true,
    });
    expect(await openFlash({ current: SECRET }, value.slice(0, -2) + 'AA')).toBeUndefined();
    expect(await openFlash({ current: SECRET }, 'garbage')).toBeUndefined();
    const { handler } = fixture();
    const other = await sealFlash({ current: SECRET }, 'plain', { ok: true }, 3000);
    const page = await handler.fetch(
      new Request(`${ORIGIN}/post`, { headers: { cookie: `surface_flash=${other.value}` } })
    );
    expect(await page.text()).toContain('<pre id="flash">null</pre>');
    expect(page.headers.getSetCookie().some(c => c.startsWith('surface_flash='))).toBe(false);
  });
});

describe('bootstrap and helpers', () => {
  it('sends action metadata and the build id header with pages', async () => {
    const handler = createWithClient();
    const page = await handler.fetch(new Request(`${ORIGIN}/`));
    expect(page.headers.get('x-surface-build')).toBe('build-1');
    const html = await page.text();
    const bootstrap = JSON.parse(
      html.match(/<script id="__SURFACE__" type="application\/json">(.*?)<\/script>/)![1]
    );
    expect(bootstrap.actions).toEqual({
      'comment/add': { targets: ['comments:list'] },
      queue: { queue: true },
    });
  });

  it('builds action URLs under BASE_PATH with encoded segments', () => {
    expect(actionPath('comment/add reply', '/demo')).toBe(
      '/demo/_surface/action/comment/add%20reply'
    );
    setBasePath('/demo');
    try {
      expect(actionUrl('comment/add' as ActionName)).toBe('/demo/_surface/action/comment/add');
    } finally {
      setBasePath('');
    }
  });

  it('collects field errors by path', async () => {
    expect(await validateSchema(commentSchema, { postId: 1 })).toEqual({
      ok: false,
      fieldErrors: { postId: ['Required'], body: ['Required'] },
      message: 'Invalid input (postId: Required; body: Required)',
    });
  });
});

/** A page with a client slot and a data-action so the engine bootstrap is written. */
function createWithClient() {
  return createHandler({
    secret: SECRET,
    manifest: defineManifest({
      buildId: 'build-1',
      routes: [
        {
          pattern: '/',
          module: {
            default: () =>
              h(
                'html',
                {},
                h('head', {}),
                h('body', {}, h('button', { 'data-action': 'plain' }, 'go'))
              ),
          },
        },
      ],
      transitions: {
        'comment/add': defineTransition({
          targets: ['comments:list'],
          handler: async () => ({ states: {} }),
        }),
        queue: defineTransition({ mode: 'queue', handler: async () => ({ states: {} }) }),
        plain: async function* () {},
      },
    }),
  });
}
