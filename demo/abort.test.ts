/**
 * @vitest-environment happy-dom
 *
 * Regression tests: abort previous transition semantics.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateSurface } from '../client/runtime/stateSurface.js';
import type { TraceEvent } from '../client/runtime/stateSurface.js';

function createTestSurface() {
  const rendered: Array<{ name: string; data: any }> = [];
  const updated: Array<{ name: string; data: any }> = [];
  const traces: TraceEvent[] = [];

  const surface = new StateSurface({
    renderTemplate: (name, data, _el) => rendered.push({ name, data }),
    hydrateTemplate: (_name, _data, _el) => () => {},
    updateTemplate: (name, data, _el) => updated.push({ name, data }),
    unmountTemplate: () => {},
    trace: event => traces.push(event),
    frameBudgetMs: 1000,
  });

  return { surface, rendered, updated, traces };
}

describe('abort previous transition', () => {
  beforeEach(() => {
    document.body.innerHTML = '<h-state name="a"></h-state>';
  });

  it('creates new AbortController on each transition call', () => {
    const { surface } = createTestSurface();
    surface.discoverAnchors();

    // Mock fetch to avoid actual network
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200 })
    );

    surface.transition('first');
    const firstController = (surface as any).abortController;

    surface.transition('second');
    const secondController = (surface as any).abortController;

    expect(firstController).not.toBe(secondController);
    expect(firstController.signal.aborted).toBe(true);
    expect(secondController.signal.aborted).toBe(false);

    fetchSpy.mockRestore();
  });

  it('aborted frames are not processed', () => {
    const { surface, traces } = createTestSurface();
    surface.discoverAnchors();

    // Simulate: create a signal, then abort it
    const controller = new AbortController();
    controller.abort();

    // onFrame should bail on aborted signal
    (surface as any).onFrame({ type: 'state', states: { a: { v: 1 } } }, controller.signal);

    // No frames should be queued
    expect((surface as any).frameQueue).toHaveLength(0);
    expect(traces.filter(t => t.kind === 'received')).toHaveLength(0);
  });

  it('done frame on aborted signal is ignored', () => {
    const { surface, traces } = createTestSurface();
    surface.discoverAnchors();

    const controller = new AbortController();
    controller.abort();

    (surface as any).onFrame({ type: 'done' }, controller.signal);

    expect(traces.filter(t => t.kind === 'done')).toHaveLength(0);
  });

  it('error frame on aborted signal is ignored', () => {
    const { surface, traces } = createTestSurface();
    surface.discoverAnchors();

    const controller = new AbortController();
    controller.abort();

    (surface as any).onFrame(
      { type: 'error', message: 'should be ignored' },
      controller.signal
    );

    expect(traces.filter(t => t.kind === 'error')).toHaveLength(0);
  });

  it('rapid transitions: only last transition state survives', () => {
    const { surface, rendered } = createTestSurface();
    surface.discoverAnchors();

    // Simulate three rapid transitions by pushing frames with different controllers
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();
    const ctrl3 = new AbortController();

    // First transition starts
    (surface as any).onFrame(
      { type: 'state', states: { a: { v: 'first' } } },
      ctrl1.signal
    );

    // Second transition aborts first
    ctrl1.abort();
    (surface as any).onFrame(
      { type: 'state', states: { a: { v: 'second' } } },
      ctrl2.signal
    );

    // Third transition aborts second
    ctrl2.abort();
    (surface as any).onFrame(
      { type: 'state', states: { a: { v: 'third' } } },
      ctrl3.signal
    );

    // Flush
    (surface as any).flushQueue(true);

    // Queue had frames from transitions 1 and 2 (already pushed before abort)
    // plus frame from transition 3. Full frames replace state,
    // so the last full frame wins.
    expect(surface.activeStates.a.v).toBe('third');
  });
});
