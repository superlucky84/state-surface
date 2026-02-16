/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateSurface } from './stateSurface.js';
import type { TraceEvent } from './stateSurface.js';

function createMockSurface() {
  const rendered: Array<{ name: string; data: any }> = [];
  const hydrated: Array<{ name: string; data: any }> = [];
  const updated: Array<{ name: string; data: any }> = [];
  const unmounted: string[] = [];
  const traces: TraceEvent[] = [];

  const surface = new StateSurface({
    renderTemplate: (name, data, _el) => {
      rendered.push({ name, data });
    },
    hydrateTemplate: (name, data, _el) => {
      hydrated.push({ name, data });
      return () => {};
    },
    updateTemplate: (name, data, _el) => {
      updated.push({ name, data });
    },
    unmountTemplate: (name, _el) => {
      unmounted.push(name);
    },
    trace: event => traces.push(event),
    frameBudgetMs: 1000, // high budget so flushQueue drains all in tests
  });

  return { surface, rendered, hydrated, updated, unmounted, traces };
}

function setupDOM(anchors: string[], stateJson?: Record<string, any>) {
  document.body.innerHTML = anchors.map(name => `<h-state name="${name}"></h-state>`).join('');

  if (stateJson) {
    const script = document.createElement('script');
    script.id = '__STATE__';
    script.type = 'application/json';
    script.textContent = JSON.stringify(stateJson);
    document.body.appendChild(script);
  }
}

describe('StateSurface', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  // ── Anchor Discovery ──

  describe('discoverAnchors', () => {
    it('finds all h-state elements', () => {
      setupDOM(['page:article', 'panel:comments']);
      const { surface } = createMockSurface();
      surface.discoverAnchors();

      // Verify by hydrating — only discovered anchors get hydrated
      surface.hydrate({
        'page:article': { id: 1 },
        'panel:comments': { count: 5 },
        'unknown:state': { x: 1 }, // no anchor for this
      });

      expect(surface.activeStates).toHaveProperty('unknown:state');
    });
  });

  // ── Bootstrap + Hydration ──

  describe('bootstrap', () => {
    it('reads __STATE__ and hydrates per anchor', () => {
      setupDOM(['page:article', 'panel:comments'], {
        'page:article': { title: 'Hello' },
        'panel:comments': { count: 3 },
      });

      const { surface, hydrated } = createMockSurface();
      surface.discoverAnchors();
      surface.bootstrap();

      expect(hydrated).toHaveLength(2);
      expect(hydrated[0]).toEqual({ name: 'page:article', data: { title: 'Hello' } });
      expect(hydrated[1]).toEqual({ name: 'panel:comments', data: { count: 3 } });
      expect(surface.activeStates).toEqual({
        'page:article': { title: 'Hello' },
        'panel:comments': { count: 3 },
      });
    });

    it('does nothing when __STATE__ is absent', () => {
      setupDOM(['page:article']);

      const { surface, hydrated } = createMockSurface();
      surface.discoverAnchors();
      surface.bootstrap();

      expect(hydrated).toHaveLength(0);
      expect(surface.activeStates).toEqual({});
    });
  });

  // ── Full Frame Apply ──

  describe('full frame apply', () => {
    it('replaces activeStates and renders new anchors', () => {
      setupDOM(['page:article', 'loading']);

      const { surface, rendered } = createMockSurface();
      surface.discoverAnchors();

      // Manually push and flush a full frame
      (surface as any).frameQueue.push({
        type: 'state',
        states: {
          'page:article': { articleId: 1 },
          loading: { articleId: 1 },
        },
      });
      (surface as any).flushQueue(true);

      expect(surface.activeStates).toEqual({
        'page:article': { articleId: 1 },
        loading: { articleId: 1 },
      });
      expect(rendered).toHaveLength(2);
    });
  });

  // ── Partial Frame Apply ──

  describe('partial frame apply', () => {
    it('merges changed and removes keys', () => {
      setupDOM(['page:article', 'loading', 'content:loaded']);

      const { surface, rendered, unmounted } = createMockSurface();
      surface.discoverAnchors();

      // First: full frame
      (surface as any).frameQueue.push({
        type: 'state',
        states: { 'page:article': { id: 1 }, loading: {} },
      });
      (surface as any).flushQueue(true);

      expect(rendered).toHaveLength(2);

      // Second: partial frame — remove loading, add content:loaded
      (surface as any).frameQueue.push({
        type: 'state',
        full: false,
        states: { 'content:loaded': { article: 'Hello' } },
        changed: ['content:loaded'],
        removed: ['loading'],
      });
      (surface as any).flushQueue(true);

      expect(unmounted).toContain('loading');
      expect(rendered).toHaveLength(3); // page:article, loading, content:loaded
      expect(surface.activeStates).toEqual({
        'page:article': { id: 1 },
        'content:loaded': { article: 'Hello' },
      });
    });

    it('updates already-mounted templates instead of re-rendering', () => {
      setupDOM(['page:article']);

      const { surface, rendered, updated } = createMockSurface();
      surface.discoverAnchors();

      // Full frame
      (surface as any).frameQueue.push({
        type: 'state',
        states: { 'page:article': { v: 1 } },
      });
      (surface as any).flushQueue(true);
      expect(rendered).toHaveLength(1);

      // Partial update
      (surface as any).frameQueue.push({
        type: 'state',
        full: false,
        states: { 'page:article': { v: 2 } },
        changed: ['page:article'],
      });
      (surface as any).flushQueue(true);

      expect(rendered).toHaveLength(1); // no new render
      expect(updated).toHaveLength(1); // update called
      expect(updated[0].data).toEqual({ v: 2 });
    });
  });

  // ── Backpressure: Coalesce Partials ──

  describe('coalesce partials', () => {
    it('merges consecutive partial frames', () => {
      setupDOM(['a', 'b', 'c']);

      const { surface, traces } = createMockSurface();
      surface.discoverAnchors();

      // Full frame first
      (surface as any).frameQueue.push({
        type: 'state',
        states: { a: { x: 1 } },
      });
      (surface as any).flushQueue(true);

      // Multiple consecutive partials
      (surface as any).frameQueue.push({
        type: 'state',
        full: false,
        states: { b: { y: 2 } },
        changed: ['b'],
      });
      (surface as any).frameQueue.push({
        type: 'state',
        full: false,
        states: { c: { z: 3 } },
        changed: ['c'],
      });
      (surface as any).flushQueue(true);

      // Should have merged into one apply
      const mergedEvents = traces.filter(t => t.kind === 'merged');
      expect(mergedEvents).toHaveLength(1);

      expect(surface.activeStates).toEqual({
        a: { x: 1 },
        b: { y: 2 },
        c: { z: 3 },
      });
    });
  });

  // ── Backpressure: Full Supersedes Partials ──

  describe('full supersedes pending partials', () => {
    it('drops partials before a full frame when queue overflows', () => {
      setupDOM(['a']);

      const { surface, traces } = createMockSurface();
      (surface as any).maxQueue = 3;
      surface.discoverAnchors();

      // Push many partials then a full — simulate overflow
      // First need a base state
      (surface as any).frameQueue.push({
        type: 'state',
        states: { a: { v: 0 } },
      });
      (surface as any).flushQueue(true);

      // Now overflow: 4 partials then a full
      for (let i = 1; i <= 4; i++) {
        (surface as any).frameQueue.push({
          type: 'state',
          full: false,
          states: { a: { v: i } },
          changed: ['a'],
        });
      }
      (surface as any).frameQueue.push({
        type: 'state',
        states: { a: { v: 'final' } },
      });
      (surface as any).flushQueue(true);

      expect(surface.activeStates).toEqual({ a: { v: 'final' } });
      // Should have dropped some partials
      const dropped = traces.filter(t => t.kind === 'dropped');
      expect(dropped.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Error Handling ──

  describe('error handling', () => {
    it('renders error template as full state when anchor exists', () => {
      setupDOM(['system:error']);

      const { surface, rendered } = createMockSurface();
      surface.discoverAnchors();

      (surface as any).handleError({
        type: 'error',
        template: 'system:error',
        data: { message: 'db timeout' },
      });

      // Should have pushed and flushed an error-as-full-state frame
      expect(rendered).toHaveLength(1);
      expect(rendered[0].name).toBe('system:error');
      expect(rendered[0].data).toEqual({ message: 'db timeout' });
    });

    it('surfaces error via trace when no anchor exists', () => {
      setupDOM([]); // no anchors

      const { surface, traces } = createMockSurface();
      surface.discoverAnchors();

      (surface as any).handleError({
        type: 'error',
        message: 'something broke',
      });

      const errorTraces = traces.filter(t => t.kind === 'error');
      expect(errorTraces).toHaveLength(1);
    });
  });

  // ── Done Handling ──

  describe('done handling', () => {
    it('flushes remaining queue on done', () => {
      setupDOM(['a']);

      const { surface, rendered } = createMockSurface();
      surface.discoverAnchors();

      // Queue a frame but don't flush yet
      (surface as any).frameQueue.push({
        type: 'state',
        states: { a: { v: 1 } },
      });

      // Simulate onFrame with done
      (surface as any).onFrame({ type: 'done' }, new AbortController().signal);

      // Queue should be drained
      expect(rendered).toHaveLength(1);
      expect(surface.activeStates).toEqual({ a: { v: 1 } });
    });
  });

  // ── Pending State ──

  describe('pending state', () => {
    it('adds pending on transition start and clears on first frame', async () => {
      setupDOM(['a', 'b']);
      const { surface } = createMockSurface();
      surface.discoverAnchors();

      const a = document.querySelector<HTMLElement>('h-state[name="a"]')!;
      const b = document.querySelector<HTMLElement>('h-state[name="b"]')!;

      let resolveFetch!: (value: Response) => void;
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockReturnValue(new Promise(resolve => (resolveFetch = resolve)) as Promise<Response>);

      const transitionPromise = surface.transition('demo');

      expect(a.hasAttribute('data-pending')).toBe(true);
      expect(b.hasAttribute('data-pending')).toBe(true);

      resolveFetch(
        new Response(
          `${JSON.stringify({ type: 'state', states: { a: { v: 1 } } })}\n${JSON.stringify({ type: 'done' })}\n`,
          { status: 200 }
        )
      );

      await transitionPromise;

      expect(a.hasAttribute('data-pending')).toBe(false);
      expect(b.hasAttribute('data-pending')).toBe(false);
      fetchSpy.mockRestore();
    });

    it('limits pending scope with pendingTargets option', async () => {
      setupDOM(['a', 'b']);
      const { surface } = createMockSurface();
      surface.discoverAnchors();

      const a = document.querySelector<HTMLElement>('h-state[name="a"]')!;
      const b = document.querySelector<HTMLElement>('h-state[name="b"]')!;

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(
            `${JSON.stringify({ type: 'state', states: { b: { v: 2 } } })}\n${JSON.stringify({ type: 'done' })}\n`,
            { status: 200 }
          )
        );

      const transitionPromise = surface.transition('demo', {}, { pendingTargets: ['b'] });

      expect(a.hasAttribute('data-pending')).toBe(false);
      expect(b.hasAttribute('data-pending')).toBe(true);

      await transitionPromise;

      expect(a.hasAttribute('data-pending')).toBe(false);
      expect(b.hasAttribute('data-pending')).toBe(false);
      fetchSpy.mockRestore();
    });

    it('keeps latest transition pending when previous transition is aborted', async () => {
      setupDOM(['a', 'b']);
      const { surface } = createMockSurface();
      surface.discoverAnchors();

      const a = document.querySelector<HTMLElement>('h-state[name="a"]')!;
      const b = document.querySelector<HTMLElement>('h-state[name="b"]')!;

      let resolveSecondFetch!: (value: Response) => void;
      let callCount = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        callCount++;

        if (callCount === 1) {
          const signal = init?.signal as AbortSignal;
          return new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                const err = new Error('Aborted');
                err.name = 'AbortError';
                reject(err);
              },
              { once: true }
            );
          }) as Promise<Response>;
        }

        return new Promise(resolve => {
          resolveSecondFetch = resolve;
        }) as Promise<Response>;
      });

      const firstTransition = surface.transition('first', {}, { pendingTargets: ['a'] });
      expect(a.hasAttribute('data-pending')).toBe(true);
      expect(b.hasAttribute('data-pending')).toBe(false);

      const secondTransition = surface.transition('second', {}, { pendingTargets: ['b'] });

      await Promise.resolve();
      expect(a.hasAttribute('data-pending')).toBe(false);
      expect(b.hasAttribute('data-pending')).toBe(true);

      resolveSecondFetch(
        new Response(
          `${JSON.stringify({ type: 'state', states: { b: { v: 3 } } })}\n${JSON.stringify({ type: 'done' })}\n`,
          { status: 200 }
        )
      );

      await secondTransition;
      await firstTransition;

      expect(a.hasAttribute('data-pending')).toBe(false);
      expect(b.hasAttribute('data-pending')).toBe(false);
      fetchSpy.mockRestore();
    });
  });
});
