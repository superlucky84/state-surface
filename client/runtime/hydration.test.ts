/**
 * @vitest-environment happy-dom
 *
 * Integration tests: hydration mismatch fallback path.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StateSurface } from './stateSurface.js';
import type { TraceEvent } from './stateSurface.js';

function createTestSurface() {
  const rendered: Array<{ name: string; data: any }> = [];
  const hydrated: Array<{ name: string; data: any }> = [];
  const updated: Array<{ name: string; data: any }> = [];
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

describe('hydration mismatch fallback', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('hydrates normally when SSR content matches', () => {
    document.body.innerHTML = `
      <h-state name="page:header" data-ssr-hash="abc123">
        <header>Blog</header>
      </h-state>
    `;
    const script = document.createElement('script');
    script.id = '__STATE__';
    script.type = 'application/json';
    script.textContent = JSON.stringify({ 'page:header': { title: 'Blog' } });
    document.body.appendChild(script);

    const { surface, hydrated, rendered } = createTestSurface();
    surface.discoverAnchors();
    surface.bootstrap();

    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].name).toBe('page:header');
    expect(rendered).toHaveLength(0); // hydration, not render
  });

  it('still hydrates anchors that have no SSR content', () => {
    // Anchor exists but was not filled by SSR (no data-ssr-hash)
    document.body.innerHTML = `
      <h-state name="page:header"></h-state>
      <h-state name="page:content"></h-state>
    `;
    const script = document.createElement('script');
    script.id = '__STATE__';
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      'page:header': { title: 'Blog' },
      'page:content': { text: 'Hello' },
    });
    document.body.appendChild(script);

    const { surface, hydrated } = createTestSurface();
    surface.discoverAnchors();
    surface.bootstrap();

    expect(hydrated).toHaveLength(2);
  });

  it('ignores state keys without matching anchor', () => {
    document.body.innerHTML = '<h-state name="page:header"></h-state>';
    const script = document.createElement('script');
    script.id = '__STATE__';
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      'page:header': { title: 'Blog' },
      'page:content': { text: 'No anchor' }, // no <h-state name="page:content">
    });
    document.body.appendChild(script);

    const { surface, hydrated } = createTestSurface();
    surface.discoverAnchors();
    surface.bootstrap();

    // Only header hydrated (content has no anchor)
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].name).toBe('page:header');

    // But state is stored for anchorless keys too
    expect(surface.activeStates).toHaveProperty('page:content');
  });

  it('full frame after hydration replaces state and re-renders changed anchors', () => {
    document.body.innerHTML = `
      <h-state name="a"></h-state>
      <h-state name="b"></h-state>
    `;
    const script = document.createElement('script');
    script.id = '__STATE__';
    script.type = 'application/json';
    script.textContent = JSON.stringify({ a: { v: 1 }, b: { v: 2 } });
    document.body.appendChild(script);

    const { surface, hydrated, updated, unmounted } = createTestSurface();
    surface.discoverAnchors();
    surface.bootstrap();
    expect(hydrated).toHaveLength(2);

    // Full frame with only 'a' — 'b' should be removed
    (surface as any).frameQueue.push({
      type: 'state',
      states: { a: { v: 10 } },
    });
    (surface as any).flushQueue(true);

    expect(surface.activeStates).toEqual({ a: { v: 10 } });
    expect(unmounted).toContain('b');
    expect(updated.filter(u => u.name === 'a')).toHaveLength(1);
  });
});
