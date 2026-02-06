/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateSurface } from './stateSurface.js';
import type { TraceEvent } from './stateSurface.js';
import { attachDevOverlay } from './devOverlay.js';

function createMockSurface() {
  const traces: TraceEvent[] = [];
  const surface = new StateSurface({
    renderTemplate: () => {},
    hydrateTemplate: () => () => {},
    updateTemplate: () => {},
    unmountTemplate: () => {},
    trace: event => traces.push(event),
    frameBudgetMs: 1000,
  });
  return { surface, traces };
}

function setDebugMode(enabled: boolean) {
  // happy-dom supports location manipulation
  const url = enabled ? 'http://localhost/?debug=1' : 'http://localhost/';
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
}

describe('devOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setDebugMode(false);
  });

  it('returns undefined when debug mode is off', () => {
    const { surface } = createMockSurface();
    const detach = attachDevOverlay(surface);
    expect(detach).toBeUndefined();
    expect(document.getElementById('state-surface-dev-overlay')).toBeNull();
  });

  it('attaches overlay when ?debug=1', () => {
    setDebugMode(true);
    const { surface } = createMockSurface();
    const detach = attachDevOverlay(surface);

    expect(detach).toBeTypeOf('function');
    expect(document.getElementById('state-surface-dev-overlay')).toBeTruthy();
  });

  it('shows initial activeStates', () => {
    setDebugMode(true);
    const { surface } = createMockSurface();
    surface.activeStates = { 'page:article': { id: 1 } };

    attachDevOverlay(surface);

    const panel = document.querySelector('[data-panel="states"]');
    expect(panel?.textContent).toContain('page:article');
    expect(panel?.textContent).toContain('"id": 1');
  });

  it('updates on trace events', () => {
    setDebugMode(true);
    const { surface } = createMockSurface();
    attachDevOverlay(surface);

    // Simulate a trace event
    surface.activeStates = { test: { v: 42 } };
    surface.trace?.({ kind: 'applied', detail: { full: true, stateCount: 1 } });

    const statesPanel = document.querySelector('[data-panel="states"]');
    expect(statesPanel?.textContent).toContain('"v": 42');

    const logPanel = document.querySelector('[data-panel="log"]');
    expect(logPanel?.textContent).toContain('applied');
  });

  it('chains with existing trace hook', () => {
    setDebugMode(true);
    const { surface, traces } = createMockSurface();
    attachDevOverlay(surface);

    surface.trace?.({ kind: 'received', detail: { queueSize: 1 } });

    // Original trace should still receive events
    expect(traces).toHaveLength(1);
    expect(traces[0].kind).toBe('received');
  });

  it('detach removes overlay and restores trace', () => {
    setDebugMode(true);
    const { surface } = createMockSurface();
    const originalTrace = surface.trace;
    const detach = attachDevOverlay(surface)!;

    expect(document.getElementById('state-surface-dev-overlay')).toBeTruthy();

    detach();

    expect(document.getElementById('state-surface-dev-overlay')).toBeNull();
    expect(surface.trace).toBe(originalTrace);
  });
});
