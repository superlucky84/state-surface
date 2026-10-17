import { describe, it, expect } from 'vitest';
import { h } from 'lithent';
import { createHandler } from '../server/core/handler.js';
import { defineManifest } from '../server/core/manifest.js';
import { defineServerComponent } from '../server/serverComponent.js';
import { FLASH_TTL, openFlash, redirectTarget, sealFlash } from '../server/flash.js';
import { seal } from '../server/secrets.js';
import type { SurfaceContext } from '../server/core/context.js';

/**
 * Stage 9 malicious input set, request half (V-10, DESIGN 10.5, DC-21, IC-09): `_redirect`
 * and Referer, flash cookies and deferred slot tokens an attacker can send. Defects found
 * here keep a `regression:` test name.
 */
const ORIGIN = 'https://surface.test';
const SECRET = 'k'.repeat(32);
const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  h(tag as never, props as never, ...(children as never[]));

describe('_redirect and Referer (open redirect)', () => {
  const same = (target: string) => new URL(target, ORIGIN).origin === ORIGIN;
  it.each([
    '//evil.test/x',
    '/\\evil.test',
    '/\\/evil.test',
    '\\\\evil.test',
    '/\tevil.test',
    '/\t/evil.test',
    '/\n/evil.test',
    '/\u007f/evil.test',
    'https://evil.test/',
    'HTTPS:evil.test',
    'javascript:alert(1)',
    ' /evil',
    '',
  ])('falls back for %j', requested => {
    const target = redirectTarget(requested, null, ORIGIN, '');
    expect(target).toBe('/');
    expect(redirectTarget(requested, null, ORIGIN, '/demo')).toBe('/demo/');
  });

  it('keeps encoded paths on this origin', () => {
    for (const requested of [
      '/%2F%2Fevil.test',
      '/%5Cevil.test',
      '/a/../..//evil',
      '/demo/%2e%2e/x',
    ])
      expect(same(redirectTarget(requested, null, ORIGIN, ''))).toBe(true);
    expect(redirectTarget('/demoevil', null, ORIGIN, '/demo')).toBe('/demo/');
  });

  it('regression: a Referer path starting with // is another host', () => {
    for (const referer of [
      `${ORIGIN}//evil.test/x`,
      `${ORIGIN}/\\evil.test/x`,
      `${ORIGIN}/\\/evil.test`,
    ]) {
      const target = redirectTarget(undefined, referer, ORIGIN, '');
      expect(target, referer).toBe('/');
      expect(same(target)).toBe(true);
    }
    expect(redirectTarget(undefined, `${ORIGIN}/from?x=1`, ORIGIN, '')).toBe('/from?x=1');
    expect(redirectTarget(undefined, 'https://evil.test/from', ORIGIN, '')).toBe('/');
  });
});

describe('flash cookie', () => {
  const secrets = { current: SECRET };
  const sealed = async (now = Date.now()) =>
    (await sealFlash(secrets, 'comments/add', { ok: true }, 4096, now)).value;

  it('rejects tampered, re-signed and malformed values', async () => {
    const value = await sealed();
    expect(await openFlash(secrets, value)).toEqual({ n: 'comments/add', ok: true });
    const [data, signature] = value.split('.');
    const forged = btoa(JSON.stringify({ n: 'comments/add', e: 9e9, ok: false }))
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    for (const bad of [
      `${forged}.${signature}`,
      `${data}.${signature.slice(0, -1)}`,
      `${data}x.${signature}`,
      `${signature}.${data}`,
      `${data}`,
      `.${signature}`,
      `${data}.${signature}.${signature}`,
      `${data}.!!!`,
      'garbage',
    ])
      expect(await openFlash(secrets, bad), bad).toBeUndefined();
    expect(await openFlash({ current: 'z'.repeat(32) }, value)).toBeUndefined();
  });

  it('regression: a captured flash expires with the cookie (no replay later)', async () => {
    const issued = 1_700_000_000_000;
    const value = await sealed(issued);
    expect(await openFlash(secrets, value, issued + FLASH_TTL * 1000)).toBeDefined();
    expect(await openFlash(secrets, value, issued + (FLASH_TTL + 1) * 1000)).toBeUndefined();
  });

  it('is read once and only by its action', async () => {
    const handler = createHandler({
      secret: SECRET,
      manifest: defineManifest({
        buildId: 'b1',
        routes: [
          {
            pattern: '/',
            module: {
              default: async (context: SurfaceContext) => {
                const other = await context.flash('like');
                const mine = await context.flash('comments/add');
                return el(
                  'html',
                  {},
                  el('head', {}),
                  el('body', {}, JSON.stringify({ other, mine }))
                );
              },
            },
          },
        ],
        transitions: {},
      }),
    });
    const response = await handler.fetch(
      new Request(`${ORIGIN}/`, { headers: { cookie: `surface_flash=${await sealed()}` } })
    );
    const body = await response.text();
    expect(body).toContain('{"mine":{"ok":true}}');
    expect(response.headers.get('set-cookie')).toMatch(/surface_flash=;.*Max-Age=0/i);
  });
});

describe('deferred slot tokens', () => {
  const Cart = defineServerComponent({
    load: async (props: { user: string }) => props,
    render: (data: { user: string }) => el('p', {}, data.user),
  });
  const handler = (buildId: string) =>
    createHandler({
      secret: SECRET,
      manifest: defineManifest({
        buildId,
        components: { 'cart.tsx#default': Cart, 'other.tsx#default': Cart },
        routes: [],
        transitions: {},
      }),
    });
  const request = (component: string, token: string, build?: string) =>
    new Request(`${ORIGIN}/_surface/island/${encodeURIComponent(component)}?p=${token}`, {
      headers: build ? { 'x-surface-build': build } : {},
    });
  const payload = { b: 'b1', c: 'cart.tsx#default', s: 'cart', k: 'strict', p: { user: 'ada' } };

  it('serves a valid token', async () => {
    const response = await handler('b1').fetch(
      request('cart.tsx#default', await seal({ current: SECRET }, payload))
    );
    expect(await response.json()).toEqual({ html: '<p>ada</p>' });
  });

  it('rejects every flipped byte, truncation and foreign encodings', async () => {
    const token = await seal({ current: SECRET }, payload);
    const statuses = new Set<number>();
    // Flip whole bytes: the last base64url character also carries unused padding bits, so
    // changing one character there can decode to the same bytes (the same token).
    const bytes = Buffer.from(token, 'base64url');
    for (let i = 0; i < bytes.length; i += Math.ceil(bytes.length / 24)) {
      const flipped = Buffer.from(bytes);
      flipped[i] ^= 0xff;
      statuses.add(
        (await handler('b1').fetch(request('cart.tsx#default', flipped.toString('base64url'))))
          .status
      );
    }
    statuses.add((await handler('b1').fetch(request('cart.tsx#default', token + 'A'))).status);
    for (const bad of [token.slice(0, 20), token.slice(0, -1), '', '%00', 'a'.repeat(5000)])
      statuses.add((await handler('b1').fetch(request('cart.tsx#default', bad))).status);
    // A flash cookie value (HMAC key) is not a token (AES key): IC-09 key separation.
    const flash = (await sealFlash({ current: SECRET }, 'x', { ok: true }, 4096)).value;
    statuses.add((await handler('b1').fetch(request('cart.tsx#default', flash))).status);
    expect([...statuses]).toEqual([400]);
  });

  it('cannot be reused by another build, component or payload shape', async () => {
    const token = await seal({ current: SECRET }, payload);
    expect((await handler('b2').fetch(request('cart.tsx#default', token))).status).toBe(409);
    expect((await handler('b2').fetch(request('cart.tsx#default', token, 'b2'))).status).toBe(409);
    expect((await handler('b1').fetch(request('other.tsx#default', token))).status).toBe(400);
    for (const shape of [{ ...payload, p: 'x' }, { b: 'b1' }, [payload], 'x', null])
      expect(
        (
          await handler('b1').fetch(
            request('cart.tsx#default', await seal({ current: SECRET }, shape))
          )
        ).status
      ).toBe(400);
  });
});
