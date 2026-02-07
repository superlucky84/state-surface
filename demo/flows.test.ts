/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StateSurface } from '../client/runtime/stateSurface.js';
import type { TraceEvent } from '../client/runtime/stateSurface.js';

type RenderCall = { name: string; data: any };

function createTestSurface() {
  const rendered: RenderCall[] = [];
  const hydrated: RenderCall[] = [];
  const updated: RenderCall[] = [];
  const unmounted: string[] = [];
  const traces: TraceEvent[] = [];

  const surface = new StateSurface({
    renderTemplate: (name, data, _el) => rendered.push({ name, data }),
    hydrateTemplate: (name, data, _el) => {
      hydrated.push({ name, data });
      return () => {};
    },
    updateTemplate: (name, data, _el) => updated.push({ name, data }),
    unmountTemplate: (name, _el) => unmounted.push(name),
    trace: event => traces.push(event),
    frameBudgetMs: 1000,
  });

  return { surface, rendered, hydrated, updated, unmounted, traces };
}

function setupAnchors(names: string[], stateJson?: Record<string, any>) {
  document.body.innerHTML = names
    .map(name => `<h-state name="${name}"></h-state>`)
    .join('');

  if (stateJson) {
    const script = document.createElement('script');
    script.id = '__STATE__';
    script.type = 'application/json';
    script.textContent = JSON.stringify(stateJson);
    document.body.appendChild(script);
  }
}

// ── Article Loading Flow ──

describe('article loading flow', () => {
  const ANCHORS = ['page:header', 'page:content', 'panel:comments', 'system:error'];

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('progresses through loading → content → comments', () => {
    setupAnchors(ANCHORS);
    const { surface, rendered, updated, traces } = createTestSurface();
    surface.discoverAnchors();

    // Frame 1: full — header + loading
    (surface as any).frameQueue.push({
      type: 'state',
      states: {
        'page:header': { title: 'Blog', nav: 'article' },
        'page:content': { loading: true, articleId: 1 },
      },
    });
    (surface as any).flushQueue(true);

    expect(surface.activeStates).toHaveProperty('page:header');
    expect(surface.activeStates).toHaveProperty('page:content');
    expect(surface.activeStates['page:content'].loading).toBe(true);
    expect(rendered).toHaveLength(2);

    // Frame 2: partial — content updated
    (surface as any).frameQueue.push({
      type: 'state',
      full: false,
      states: {
        'page:content': {
          loading: false,
          articleId: 1,
          title: 'Article #1',
          body: 'Content here.',
        },
      },
      changed: ['page:content'],
    });
    (surface as any).flushQueue(true);

    expect(surface.activeStates['page:content'].loading).toBe(false);
    expect(surface.activeStates['page:content'].title).toBe('Article #1');
    expect(updated).toHaveLength(1);
    expect(updated[0].name).toBe('page:content');

    // Frame 3: partial — comments added
    (surface as any).frameQueue.push({
      type: 'state',
      full: false,
      states: {
        'panel:comments': {
          articleId: 1,
          comments: [{ author: 'Alice', text: 'Nice!' }],
        },
      },
      changed: ['panel:comments'],
    });
    (surface as any).flushQueue(true);

    expect(surface.activeStates).toHaveProperty('panel:comments');
    expect(rendered).toHaveLength(3); // header, content, comments
    expect(traces.filter(t => t.kind === 'applied')).toHaveLength(3);
  });

  it('header is NOT re-rendered during partial content/comments updates', () => {
    setupAnchors(ANCHORS);
    const { surface, rendered, updated } = createTestSurface();
    surface.discoverAnchors();

    // Full frame
    (surface as any).frameQueue.push({
      type: 'state',
      states: {
        'page:header': { title: 'Blog' },
        'page:content': { loading: true },
      },
    });
    (surface as any).flushQueue(true);
    expect(rendered).toHaveLength(2);

    const headerRenderCount = rendered.filter(r => r.name === 'page:header').length;

    // Partial: update content only
    (surface as any).frameQueue.push({
      type: 'state',
      full: false,
      states: { 'page:content': { loading: false, title: 'Done' } },
      changed: ['page:content'],
    });
    (surface as any).flushQueue(true);

    // Partial: add comments only
    (surface as any).frameQueue.push({
      type: 'state',
      full: false,
      states: { 'panel:comments': { comments: [] } },
      changed: ['panel:comments'],
    });
    (surface as any).flushQueue(true);

    // Header should have been rendered exactly once — no remount
    const finalHeaderRenders = rendered.filter(r => r.name === 'page:header').length;
    const headerUpdates = updated.filter(u => u.name === 'page:header').length;

    expect(finalHeaderRenders).toBe(headerRenderCount);
    expect(headerUpdates).toBe(0);
  });
});

// ── Search Flow ──

describe('search flow', () => {
  const ANCHORS = ['page:header', 'search:input', 'search:results', 'system:error'];

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('progresses through loading → results', () => {
    setupAnchors(ANCHORS);
    const { surface, rendered, updated } = createTestSurface();
    surface.discoverAnchors();

    // Full: header + input + loading results
    (surface as any).frameQueue.push({
      type: 'state',
      states: {
        'page:header': { title: 'Search', nav: 'search' },
        'search:input': { query: 'lithent' },
        'search:results': { loading: true, query: 'lithent' },
      },
    });
    (surface as any).flushQueue(true);

    expect(rendered).toHaveLength(3);
    expect(surface.activeStates['search:results'].loading).toBe(true);

    // Partial: results loaded (header + input untouched)
    (surface as any).frameQueue.push({
      type: 'state',
      full: false,
      states: {
        'search:results': {
          loading: false,
          query: 'lithent',
          items: [{ title: 'Result 1', url: '#1' }],
        },
      },
      changed: ['search:results'],
    });
    (surface as any).flushQueue(true);

    expect(surface.activeStates['search:results'].loading).toBe(false);
    expect(updated).toHaveLength(1);
    expect(updated[0].name).toBe('search:results');
  });

  it('header and input are NOT updated during results partial', () => {
    setupAnchors(ANCHORS);
    const { surface, rendered, updated } = createTestSurface();
    surface.discoverAnchors();

    // Full
    (surface as any).frameQueue.push({
      type: 'state',
      states: {
        'page:header': { title: 'Search' },
        'search:input': { query: 'test' },
        'search:results': { loading: true, query: 'test' },
      },
    });
    (surface as any).flushQueue(true);

    // Partial: only results
    (surface as any).frameQueue.push({
      type: 'state',
      full: false,
      states: { 'search:results': { loading: false, items: [] } },
      changed: ['search:results'],
    });
    (surface as any).flushQueue(true);

    const headerUpdates = updated.filter(u => u.name === 'page:header').length;
    const inputUpdates = updated.filter(u => u.name === 'search:input').length;

    expect(headerUpdates).toBe(0);
    expect(inputUpdates).toBe(0);
  });
});

// ── Unchanged Anchors Don't Remount ──

describe('unchanged anchors stability', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('unchanged <h-state> roots do not remount on partial updates', () => {
    setupAnchors(['a', 'b', 'c']);
    const { surface, rendered, updated, unmounted } = createTestSurface();
    surface.discoverAnchors();

    // Full: mount all three
    (surface as any).frameQueue.push({
      type: 'state',
      states: { a: { v: 1 }, b: { v: 2 }, c: { v: 3 } },
    });
    (surface as any).flushQueue(true);
    expect(rendered).toHaveLength(3);

    // Partial: only update 'b'
    (surface as any).frameQueue.push({
      type: 'state',
      full: false,
      states: { b: { v: 20 } },
      changed: ['b'],
    });
    (surface as any).flushQueue(true);

    // 'a' and 'c' should NOT be re-rendered or updated
    expect(rendered.filter(r => r.name === 'a')).toHaveLength(1);
    expect(rendered.filter(r => r.name === 'c')).toHaveLength(1);
    expect(updated.filter(u => u.name === 'a')).toHaveLength(0);
    expect(updated.filter(u => u.name === 'c')).toHaveLength(0);
    expect(unmounted).toHaveLength(0);

    // Only 'b' updated
    expect(updated.filter(u => u.name === 'b')).toHaveLength(1);
  });
});

// ── Post-Hydration First Action ──

describe('post-hydration first action', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('first user action after hydration updates only changed anchors', () => {
    // SSR state: header + content pre-rendered
    const initialStates = {
      'page:header': { title: 'Blog' },
      'page:content': { articleId: 1, title: 'SSR Article' },
    };

    setupAnchors(['page:header', 'page:content', 'panel:comments'], initialStates);
    const { surface, hydrated, rendered, updated, unmounted } = createTestSurface();
    surface.discoverAnchors();
    surface.bootstrap();

    expect(hydrated).toHaveLength(2);
    expect(rendered).toHaveLength(0); // hydration, not render

    // First user action: partial update to content + add comments
    (surface as any).frameQueue.push({
      type: 'state',
      full: false,
      states: {
        'page:content': { articleId: 2, title: 'New Article' },
        'panel:comments': { comments: [{ author: 'Test', text: 'Hello' }] },
      },
      changed: ['page:content', 'panel:comments'],
    });
    (surface as any).flushQueue(true);

    // Header: not touched at all (not in changed list)
    expect(updated.filter(u => u.name === 'page:header')).toHaveLength(0);
    expect(rendered.filter(r => r.name === 'page:header')).toHaveLength(0);

    // Content: updated (was hydrated, now changed)
    expect(updated.filter(u => u.name === 'page:content')).toHaveLength(1);

    // Comments: rendered (new anchor, not previously mounted)
    expect(rendered.filter(r => r.name === 'panel:comments')).toHaveLength(1);

    // Nothing unmounted
    expect(unmounted).toHaveLength(0);
  });
});
