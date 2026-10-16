import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createDemo, surfaceHeaders } from '../../testing/server.js';
import { decodeFrames } from '../shared/ndjson.js';
import type { Op, PatchFrame, WireFrame } from '../shared/protocol.js';

let app: any;
beforeAll(async () => {
  ({ server: app } = await createDemo({}));
});

describe('demo SSR page', () => {
  it('GET / returns SSR-rendered home HTML with filled home anchors', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<h-state name="page:header"');
    expect(res.text).toContain('<h-state name="page:hero"');
    expect(res.text).toContain('<h-state name="page:concepts"');
    expect(res.text).toContain('<h-state name="page:features"');

    // SSR-filled content
    expect(res.text).toContain('StateSurface');
    expect(res.text).not.toContain('data-ssr-hash');

    // One bootstrap: every home slot is a server slot (no client code, no props).
    const bootstrap = JSON.parse(res.text.match(/id="__SURFACE__"[^>]*>(.*?)<\/script>/)![1]);
    expect(bootstrap).toMatchObject({ pageId: 'index', basePath: '' });
    expect(bootstrap.slots).toEqual([
      { id: 'page:header', mode: 'server' },
      { id: 'page:hero', mode: 'server' },
      { id: 'page:concepts', mode: 'server' },
      { id: 'page:features', mode: 'server' },
      { id: 'system:error', mode: 'server' },
    ]);
    expect(res.text).not.toContain('__STATE__');
  });

  it('GET / keeps cross-page slots out of home surface', async () => {
    const res = await request(app).get('/');

    expect(res.text).not.toContain('name="guide:content"');
    expect(res.text).not.toContain('name="guide:toc"');
    expect(res.text).not.toContain('name="demo:controls"');
    expect(res.text).not.toContain('name="search:input"');
    expect(res.text).not.toContain('name="search:results"');
  });

  it('GET / without lang cookie defaults to English content', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('State-Layout Mapping Runtime');
    expect(res.text).toContain('10-Min Quickstart');
    expect(res.text).not.toContain('상태-레이아웃 매핑 런타임');
  });

  it('GET / with lang=ko cookie renders Korean content', async () => {
    const res = await request(app).get('/').set('Cookie', 'lang=ko');

    expect(res.status).toBe(200);
    expect(res.text).toContain('상태-레이아웃 매핑 런타임');
    expect(res.text).toContain('10분 퀵스타트');
    expect(res.text).not.toContain('State-Layout Mapping Runtime');
  });

  it('GET /examples/search with lang=ko cookie renders Korean labels', async () => {
    const res = await request(app).get('/examples/search').set('Cookie', 'lang=ko');

    expect(res.status).toBe(200);
    expect(res.text).toContain('검색');
    expect(res.text).toContain('StateSurface 기능과 개념 검색');
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
  it('guide-load: reset patch with the loading state, then the content, then done', async () => {
    const { frames } = await transition('guide-load', { slug: 'surface' }, 'guide/[slug]');
    expect(frames.map(f => f.type)).toEqual(['patch', 'patch', 'done']);
    expect(frames[0]).toMatchObject({ reset: true });
    expect(op(frames[0], 'page:header', 'html')).toBeDefined();
    expect(op(frames[0], 'guide:toc', 'html')!.html).toContain('href="#');
    expect(op(frames[1], 'guide:content', 'html')!.html).toContain('<h2');
  });

  it('search: header, input and loading results first, results second', async () => {
    const { frames } = await transition('search', { query: 'streaming' }, 'examples/search');
    expect(frames.map(f => f.type)).toEqual(['patch', 'patch', 'done']);
    expect(op(frames[0], 'search:input', 'html')!.html).toContain('value="streaming"');
    expect(op(frames[0], 'search:results', 'html')).toBeDefined();
    expect(op(frames[1], 'search:results', 'html')!.html).toContain('/examples/streaming');
  });

  it('stream-demo: full → partial → accumulate → removed → full, done from the engine', async () => {
    const { frames } = await transition(
      'stream-demo',
      { mode: 'full-sequence' },
      'examples/streaming'
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
      { mode: 'error-demo' },
      'examples/streaming'
    );
    expect(frames.at(-1)).toMatchObject({
      type: 'error',
      slot: 'system:error',
      message: expect.stringContaining('demonstration error'),
    });
    expect((frames.at(-1) as { html: string }).html).toContain('demonstration error');
  });

  it('switch-lang sets the cookie and re-renders the page in the target language', async () => {
    const { res, frames } = await transition('switch-lang', { lang: 'ko', page: 'home' }, 'index');
    const cookies = res.headers['set-cookie'];
    expect(Array.isArray(cookies) ? cookies.join('; ') : cookies).toContain('lang=ko');
    expect(frames.map(f => f.type)).toEqual(['patch', 'done']);
    expect(op(frames[0], 'page:hero', 'html')!.html).toContain('상태-레이아웃');
    const english = await transition('switch-lang', { lang: 'en', page: 'home' }, 'index');
    expect(op(english.frames[0], 'page:hero', 'html')!.html).toContain(
      'State-Layout Mapping Runtime'
    );
  });

  it('action-demo: reset patch then the processed result', async () => {
    const { frames } = await transition(
      'action-demo',
      { type: 'button', variant: 'primary' },
      'examples/actions'
    );
    expect(frames.map(f => f.type)).toEqual(['patch', 'patch', 'done']);
    expect(op(frames[1], 'actions:playground', 'html')!.html).toContain('processed');
    expect(op(frames[1], 'actions:log', 'html')!.html).toContain('DONE');
  });

  it('ui-patch-demo theme: ui ops after content, partial keeps the patch', async () => {
    const { frames } = await transition(
      'ui-patch-demo',
      { action: 'theme', theme: 'warning' },
      'examples/ui-patch'
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
      'examples/ui-patch'
    );
    expect(frames[1]).toEqual({
      type: 'patch',
      ops: [
        { slot: 'uipatch:preview', ui: expect.objectContaining({ classAdd: ['tone-success'] }) },
      ],
    });
  });

  it('vt-demo is an action-level View Transition with a public not-found error', async () => {
    const ok = await transition('vt-demo', {}, 'examples/view-transition');
    expect(ok.res.headers['x-surface-view-transition']).toBe('1');
    // A failure before the first frame is a 500 whose body is still the error frame.
    const res = await request(app)
      .post('/transition/vt-demo')
      .set(surfaceHeaders('examples/view-transition'))
      .send({ card: 'missing' });
    expect(res.status).toBe(500);
    expect(decodeFrames<WireFrame>(res.text).at(-1)).toMatchObject({
      type: 'error',
      message: 'Card "missing" not found',
    });
  });
});
