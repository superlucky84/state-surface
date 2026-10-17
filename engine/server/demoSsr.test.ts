import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createDemo, surfaceHeaders } from '../../testing/server.js';
import { decodeFrames } from '../shared/ndjson.js';
import type { Op, PatchFrame, WireFrame } from '../shared/protocol.js';

let app: any;
beforeAll(async () => {
  ({ server: app } = await createDemo({}));
});

const bootstrapOf = (html: string) =>
  JSON.parse(html.match(/id="__SURFACE__"[^>]*>(.*?)<\/script>/)![1]);
const slotHtml = (html: string, slot: string) =>
  html.match(new RegExp(`<h-state name="${slot}"[^>]*>([\\s\\S]*?)</h-state>`))?.[1];

describe('demo SSR page', () => {
  it('GET /en returns the rendered home HTML with filled home anchors', async () => {
    const res = await request(app).get('/en');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<html lang="en">');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="page:hero"');
    expect(res.text).toContain('<h-state name="page:concepts"');
    expect(res.text).toContain('<h-state name="page:features"');

    // SSR-filled content
    expect(res.text).toContain('StateSurface');
    expect(res.text).not.toContain('data-ssr-hash');

    // Language alternates for every locale plus the language-less x-default.
    expect(res.text).toContain('<link rel="alternate" hreflang="en" href="/en" data-ss>');
    expect(res.text).toContain('<link rel="alternate" hreflang="ko" href="/ko" data-ss>');
    expect(res.text).toContain('<link rel="alternate" hreflang="x-default" href="/" data-ss>');

    // One bootstrap: every home slot is static (no client code, no props).
    const bootstrap = bootstrapOf(res.text);
    expect(bootstrap).toMatchObject({ pageId: '[lang]/index', basePath: '' });
    expect(bootstrap.slots).toEqual([
      { id: 'page:header', mode: 'static' },
      { id: 'page:hero', mode: 'static' },
      { id: 'page:concepts', mode: 'static' },
      { id: 'page:features', mode: 'static' },
      { id: 'system:error', mode: 'server' },
    ]);
    expect(res.text).not.toContain('__STATE__');
    // Prerendered page: the engine scripts carry no per-request nonce.
    expect(res.text).not.toMatch(/<script[^>]*nonce=/);
  });

  it('GET /en keeps cross-page slots out of home surface', async () => {
    const res = await request(app).get('/en');

    expect(res.text).not.toContain('name="guide:content"');
    expect(res.text).not.toContain('name="guide:toc"');
    expect(res.text).not.toContain('name="demo:controls"');
    expect(res.text).not.toContain('name="search:input"');
    expect(res.text).not.toContain('name="search:results"');
  });

  it('GET / without lang cookie redirects to English content', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/en');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers.vary).toBe('cookie, accept-language');

    const en = await request(app).get('/en');
    expect(en.status).toBe(200);
    expect(en.text).toContain('State-Layout Mapping Runtime');
    expect(en.text).toContain('10-Min Quickstart');
    expect(en.text).not.toContain('상태-레이아웃 매핑 런타임');
  });

  it('GET / redirects by lang cookie, then Accept-Language; /ko renders Korean content', async () => {
    const byCookie = await request(app)
      .get('/')
      .set('Cookie', 'lang=ko')
      .set('Accept-Language', 'en');
    expect(byCookie.status).toBe(302);
    expect(byCookie.headers.location).toBe('/ko');
    const byHeader = await request(app).get('/').set('Accept-Language', 'ko-KR,ko;q=0.9');
    expect(byHeader.headers.location).toBe('/ko');

    const res = await request(app).get('/ko');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<html lang="ko">');
    expect(res.text).toContain('상태-레이아웃 매핑 런타임');
    expect(res.text).toContain('10분 퀵스타트');
    expect(res.text).not.toContain('State-Layout Mapping Runtime');
    // Links stay in the page language.
    expect(slotHtml(res.text, 'page:hero')).toContain('href="/ko/guide/quickstart"');
  });

  it('GET /ko/examples/search renders Korean labels', async () => {
    const res = await request(app).get('/ko/examples/search');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<html lang="ko">');
    expect(res.text).toContain('검색');
    expect(res.text).toContain('StateSurface 기능과 개념 검색');
    expect(bootstrapOf(res.text).pageId).toBe('[lang]/examples/search');
    // An SSR page: the engine script carries the request nonce.
    expect(res.text).toMatch(/<script type="module"[^>]*nonce="[^"]+"/);
  });

  it('?lang=ko on a language page remembers the choice and redirects without it', async () => {
    const en = await request(app).get('/en/examples/search');
    const header = slotHtml(en.text, 'page:header')!;
    // The header is static markup: language switches are links, not actions.
    expect(header).not.toContain('data-action');
    const href = /<a href="([^"]+)" hreflang="ko" lang="ko" data-prefetch="false"/.exec(
      header
    )?.[1];
    expect(href).toBe('/ko/examples/search?lang=ko');

    const switched = await request(app).get(href!);
    expect(switched.status).toBe(302);
    expect(switched.headers.location).toBe('/ko/examples/search');
    const cookies = switched.headers['set-cookie'];
    expect(Array.isArray(cookies) ? cookies.join('; ') : cookies).toMatch(
      /^lang=ko; Path=\/; SameSite=Lax; Max-Age=31536000/
    );
  });

  it('GET /en/guide/surface is a prerendered page: sections and highlighted code, no transition', async () => {
    const res = await request(app).get('/en/guide/surface');

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('name="guide:content"');
    expect(res.text).not.toContain('animate-pulse');
    expect(slotHtml(res.text, 'guide:toc')).toContain('href="#');
    const article = res.text.match(/<article[^>]*>([\s\S]*?)<\/article>/)![1];
    expect(article).toContain('<h2');
    expect(article.match(/<section id="/g)!.length).toBeGreaterThan(1);
    // Code blocks are highlighted on the server (no Prism plugin).
    expect(article).toContain('<span class="token keyword">');
    expect(article).toContain('<span class="code-ln">');

    const bootstrap = bootstrapOf(res.text);
    expect(bootstrap.pageId).toBe('[lang]/guide/[slug]');
    expect(bootstrap.boot).toBeUndefined();
    expect(bootstrap.slots).toEqual([
      { id: 'page:header', mode: 'static' },
      { id: 'guide:toc', mode: 'static' },
      { id: 'system:error', mode: 'server' },
    ]);
    expect(bootstrap.plugins.map((plugin: { id: string }) => plugin.id)).toEqual([
      'client/plugins/guideToc.ts#guideToc',
    ]);
    expect(res.text).not.toMatch(/<script[^>]*nonce=/);

    expect((await request(app).get('/en/guide/missing')).status).toBe(404);
  });
});

async function transition(name: string, params: Record<string, unknown>, page: string) {
  const res = await request(app)
    .post(`/transition/${name}`)
    .set(surfaceHeaders(page))
    .send(params)
    .set('Content-Type', 'application/json');
  expect(res.status).toBe(200);
  return { res, frames: decodeFrames<WireFrame>(res.text) };
}
const patches = (frames: WireFrame[]) => frames.filter((f): f is PatchFrame => f.type === 'patch');
const op = (frame: WireFrame, slot: string, kind: string) =>
  (frame as PatchFrame).ops.find(item => item.slot === slot && kind in item) as
    | (Op & Record<string, any>)
    | undefined;

describe('demo transitions (server slots → html ops)', () => {
  it('search: input and loading results first, results second, in the page language', async () => {
    const { frames } = await transition(
      'search',
      { query: 'streaming', lang: 'ko' },
      '[lang]/examples/search'
    );
    expect(frames.map(f => f.type)).toEqual(['patch', 'patch', 'done']);
    // The static header is not part of the frames.
    expect(op(frames[0], 'page:header', 'html')).toBeUndefined();
    expect(op(frames[0], 'search:input', 'html')!.html).toContain('value="streaming"');
    expect(op(frames[0], 'search:input', 'html')!.html).toContain('StateSurface 기능과 개념 검색');
    expect(op(frames[0], 'search:results', 'html')).toBeDefined();
    expect(op(frames[1], 'search:results', 'html')!.html).toContain(
      'href="/ko/examples/streaming"'
    );
    // Without a lang param the transition falls back to English.
    const fallback = await transition('search', { query: 'streaming' }, '[lang]/examples/search');
    expect(op(fallback.frames[1], 'search:results', 'html')!.html).toContain(
      'href="/en/examples/streaming"'
    );
  });

  it('stream-demo: full → partial → accumulate → removed → full, done from the engine', async () => {
    const { frames } = await transition(
      'stream-demo',
      { mode: 'full-sequence', lang: 'en' },
      '[lang]/examples/streaming'
    );
    const list = patches(frames);
    expect(frames.at(-1)).toEqual({ type: 'done' });
    expect(list[0].reset).toBe(true);
    expect(list.some(p => op(p, 'demo:output', 'remove'))).toBe(true);
    expect(list.at(-1)!.reset).toBe(true);
    expect(op(list.at(-1)!, 'demo:output', 'html')!.html).toContain('restored');
    // The accumulated timeline entry is rendered by the server (DC-10).
    expect(list.some(p => op(p, 'demo:timeline', 'html')?.html.includes('Accumulate'))).toBe(true);
  });

  it('stream-demo error mode ends with an error frame for the error slot', async () => {
    const { frames } = await transition(
      'stream-demo',
      { mode: 'error-demo', lang: 'en' },
      '[lang]/examples/streaming'
    );
    expect(frames.at(-1)).toMatchObject({
      type: 'error',
      slot: 'system:error',
      message: expect.stringContaining('demonstration error'),
    });
    expect((frames.at(-1) as { html: string }).html).toContain('demonstration error');
  });

  it('action-demo: reset patch then the processed result', async () => {
    const { frames } = await transition(
      'action-demo',
      { type: 'button', variant: 'primary', lang: 'en' },
      '[lang]/examples/actions'
    );
    expect(frames.map(f => f.type)).toEqual(['patch', 'patch', 'done']);
    expect(op(frames[1], 'actions:playground', 'html')!.html).toContain('processed');
    expect(op(frames[1], 'actions:log', 'html')!.html).toContain('DONE');
  });

  it('ui-patch-demo theme: ui ops after content, partial keeps the patch', async () => {
    const { frames } = await transition(
      'ui-patch-demo',
      { action: 'theme', theme: 'warning' },
      '[lang]/examples/ui-patch'
    );
    const ui = op(frames[0], 'uipatch:preview', 'ui')!.ui;
    expect(ui.classAdd).toContain('tone-warning');
    expect(ui.cssVars).toHaveProperty('--card-accent');
    const ops = (frames[0] as PatchFrame).ops;
    expect(ops.findIndex(o => 'ui' in o)).toBeGreaterThan(ops.findIndex(o => 'html' in o));
    expect(op(frames[1], 'uipatch:preview', 'ui')).toBeUndefined();
  });

  it('ui-patch-demo style-only: a ui op without content', async () => {
    const { frames } = await transition(
      'ui-patch-demo',
      { action: 'style-only', theme: 'success' },
      '[lang]/examples/ui-patch'
    );
    expect(frames[1]).toEqual({
      type: 'patch',
      ops: [
        { slot: 'uipatch:preview', ui: expect.objectContaining({ classAdd: ['tone-success'] }) },
      ],
    });
  });

  it('vt-demo is an action-level View Transition with a public not-found error', async () => {
    const ok = await transition('vt-demo', {}, '[lang]/examples/view-transition');
    expect(ok.res.headers['x-surface-view-transition']).toBe('1');
    // A failure before the first frame is a 500 whose body is still the error frame.
    const res = await request(app)
      .post('/transition/vt-demo')
      .set(surfaceHeaders('[lang]/examples/view-transition'))
      .send({ card: 'missing' });
    expect(res.status).toBe(500);
    expect(decodeFrames<WireFrame>(res.text).at(-1)).toMatchObject({
      type: 'error',
      message: 'Card "missing" not found',
    });
  });
});
