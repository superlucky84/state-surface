import { describe, it, expect } from 'vitest';
import { h } from 'lithent';
import { createHandler } from '../server/core/handler.js';
import { defineManifest } from '../server/core/manifest.js';
import { defineServerComponent } from '../server/serverComponent.js';
import { decodeFrames } from '../shared/ndjson.js';
import { Island, Slot } from '../shared/surfaceTree.js';
import type { SurfaceContext } from '../server/core/context.js';
import type { StateFrame, WireFrame } from '../shared/protocol.js';
import { random } from './fuzz.js';

/**
 * Stage 9 parallel SSR load: many requests in flight at once, each awaiting at random points
 * (page function, server component `load`, middleware, transition frames). Every response
 * may carry only its own user: page HTML, server slots, client props in `__SURFACE__`,
 * deferred slot tokens, cookies, nonces and transition frames.
 */
const ORIGIN = 'https://surface.test';
const SECRET = 'p'.repeat(32);
const COUNT = 200;
const r = random(77);
const pause = () => new Promise(resolve => setTimeout(resolve, r.int(4)));
const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  h(tag as never, props as never, ...(children as never[]));
const userOf = (ctx: SurfaceContext) => ctx.request.headers.get('x-user') ?? 'none';

const Profile = defineServerComponent({
  load: async (props: { user: string }, ctx) => {
    await pause();
    return {
      user: props.user,
      header: userOf(ctx),
      local: (ctx.locals as { user?: string }).user,
    };
  },
  render: (data: { user: string; header: string; local?: string }) =>
    el('p', {}, `${data.user}|${data.header}|${data.local}`),
});
const Badge = (props: { user: string }) => el('b', {}, props.user);

const handler = createHandler({
  secret: SECRET,
  middleware: [
    async (ctx, next) => {
      await pause();
      (ctx.locals as { user?: string }).user = userOf(ctx);
      ctx.cookies.set('seen', userOf(ctx));
      return next();
    },
  ],
  manifest: defineManifest({
    buildId: 'b1',
    components: { 'profile.tsx#default': Profile, 'badge.tsx#default': Badge },
    routes: [
      {
        pattern: '/',
        page: {
          id: 'home',
          slots: {
            profile: { mode: 'server', componentId: 'profile.tsx#default', component: Profile },
            badge: { mode: 'client', componentId: 'badge.tsx#default' },
          },
        },
        module: {
          default: async (ctx: SurfaceContext) => {
            const user = userOf(ctx);
            await pause();
            const profile = (props: Record<string, unknown> = {}) =>
              el(Island, {
                __ssComponent: Profile,
                __ssId: 'profile.tsx#default',
                user,
                ...props,
              });
            return el(
              'html',
              {},
              el(
                'head',
                {},
                el('title', {}, user),
                el('meta', { name: 'nonce', content: ctx.nonce })
              ),
              el(
                'body',
                {},
                el('h1', {}, user),
                el(Slot, { name: 'profile', mode: 'server' }, profile()),
                el(
                  Slot,
                  { name: 'badge', 'client:load': true },
                  el(Island, { __ssComponent: Badge, __ssId: 'badge.tsx#default', user })
                ),
                el(
                  Slot,
                  {
                    name: 'later',
                    mode: 'server',
                    'server:defer': true,
                    fallback: el('i', {}, 'loading'),
                  },
                  profile()
                )
              )
            );
          },
        },
      },
    ],
    transitions: {
      echo: {
        targets: ['profile', 'badge'],
        handler: async function* (params: Record<string, unknown>, ctx: SurfaceContext) {
          await pause();
          yield {
            type: 'state',
            states: { badge: { user: params.user }, profile: { user: userOf(ctx) } },
          } as StateFrame;
          await pause();
          yield {
            type: 'state',
            accumulate: true,
            states: { badge: { user: `+${params.user}` } },
          } as StateFrame;
        },
      },
    },
  }),
});

// `.` is outside the base64url (tokens) and hex (nonces) alphabets: no accidental matches.
const user = (i: number) => `usr.${String(i).padStart(3, '0')}`;
const users = (text: string) => new Set(text.match(/usr\.\d{3}/g) ?? []);

describe('parallel SSR load', () => {
  it(`keeps ${COUNT} concurrent page renders apart (HTML, state, tokens, cookies, nonces)`, async () => {
    const pages = await Promise.all(
      Array.from({ length: COUNT }, async (_, i) => {
        const response = await handler.fetch(
          new Request(`${ORIGIN}/`, { headers: { 'x-user': user(i) } })
        );
        return { i, response, html: await response.text() };
      })
    );
    const nonces = new Set<string>();
    const deferred: Array<{ i: number; token: string }> = [];
    for (const { i, response, html } of pages) {
      expect(response.status).toBe(200);
      expect(users(html), `response ${i}`).toEqual(new Set([user(i)]));
      expect(html).toContain(`<p>${user(i)}|${user(i)}|${user(i)}</p>`);
      expect(response.headers.get('set-cookie')).toContain(`seen=${user(i)}`);
      const bootstrap = JSON.parse(html.match(/id="__SURFACE__"[^>]*>(.*?)<\/script>/s)![1]);
      const badge = bootstrap.slots.find((slot: { id: string }) => slot.id === 'badge');
      expect(badge.props).toEqual({ user: user(i) });
      const later = bootstrap.slots.find((slot: { id: string }) => slot.id === 'later');
      deferred.push({ i, token: later.defer });
      nonces.add(html.match(/name="nonce" content="([^"]+)"/)![1]);
    }
    expect(nonces.size).toBe(COUNT);

    // Deferred slots: the token carries the page's props, the request its own cookies/headers.
    const islands = await Promise.all(
      deferred.map(async ({ i, token }) => {
        const response = await handler.fetch(
          new Request(`${ORIGIN}/_surface/island/profile.tsx%23default?p=${token}`, {
            headers: { 'x-user': user(i), 'x-surface-build': 'b1' },
          })
        );
        return { i, body: await response.text() };
      })
    );
    for (const { i, body } of islands)
      expect(JSON.parse(body), `island ${i}`).toEqual({
        html: `<p>${user(i)}|${user(i)}|${user(i)}</p>`,
      });
  });

  it(`keeps ${COUNT} concurrent transition streams apart`, async () => {
    const streams = await Promise.all(
      Array.from({ length: COUNT }, async (_, i) => {
        const response = await handler.fetch(
          new Request(`${ORIGIN}/transition/echo`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-surface-build': 'b1',
              'x-surface-page': 'home',
              'x-user': user(i),
            },
            body: JSON.stringify({ user: user(i) }),
          })
        );
        return { i, text: await response.text() };
      })
    );
    for (const { i, text } of streams) {
      expect(users(text), `stream ${i}`).toEqual(new Set([user(i)]));
      const frames = decodeFrames<WireFrame>(text);
      expect(frames.at(-1)).toEqual({ type: 'done' });
      expect(frames[1]).toEqual({
        type: 'patch',
        ops: [{ slot: 'badge', merge: { user: `+${user(i)}` } }],
      });
    }
  });
});
