/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateSurface } from './stateSurface.js';
import type { TraceEvent } from './stateSurface.js';
import { attachDevOverlay } from './devOverlay.js';
import { warning } from './trace.js';
import { ComponentHost } from './componentHost.js';
import { SlotDom } from './slotDom.js';

function createMockSurface(props: Record<string, Record<string, unknown>> = {}) {
  const traces: TraceEvent[] = [];
  const host = new ComponentHost({ loaders: {} });
  const surface = new StateSurface({
    bootstrap: { buildId: 'b', pageId: 'p', basePath: '' },
    slots: Object.entries(props).map(([id, value]) => ({
      id,
      mode: 'client' as const,
      component: `${id}#default`,
      props: value,
    })),
    host,
    dom: new SlotDom(host, undefined),
    trace: event => traces.push(event),
  });
  return { surface, traces };
}
const setStates = (surface: StateSurface, states: Record<string, unknown>) =>
  Object.defineProperty(surface, 'activeStates', { value: states, configurable: true });

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
    const { surface } = createMockSurface({ 'page:article': { id: 1 } });

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
    setStates(surface, { test: { v: 42 } });
    surface.trace?.({ kind: 'applied', detail: { full: true, stateCount: 1 } });

    const statesPanel = document.querySelector('[data-panel="states"]');
    expect(statesPanel?.textContent).toContain('"v": 42');

    const logPanel = document.querySelector('[data-panel="log"]');
    expect(logPanel?.textContent).toContain('applied');
  });

  it('keeps the debug log and shows runtime warnings from any emitter', () => {
    setDebugMode(true);
    const { surface, traces } = createMockSurface();
    attachDevOverlay(surface);

    surface.trace?.({ kind: 'received', detail: { queueSize: 1 } });
    warning('plugin "x" changed DOM inside client slot "a" during attach.', false);
    warning('plugin "x" changed DOM inside client slot "a" during attach.', false);

    // The ?debug=1 console log still receives runtime events.
    expect(traces.map(event => event.kind)).toEqual(['received']);
    const panel = document.querySelector<HTMLElement>('[data-panel="warnings"]')!;
    expect(panel.textContent).toBe('plugin "x" changed DOM inside client slot "a" during attach.');
    expect(panel.parentElement!.style.display).toBe('');
  });

  it('detach removes the overlay and its trace subscription', () => {
    setDebugMode(true);
    const { surface } = createMockSurface();
    const detach = attachDevOverlay(surface)!;

    expect(document.getElementById('state-surface-dev-overlay')).toBeTruthy();

    detach();

    expect(document.getElementById('state-surface-dev-overlay')).toBeNull();
    // A later event does not reach the removed overlay.
    expect(() => surface.trace?.({ kind: 'done' })).not.toThrow();
  });
});
