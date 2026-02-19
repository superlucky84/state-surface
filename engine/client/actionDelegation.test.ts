/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindDeclarativeActions } from './actionDelegation.js';
import type { StateSurface, TraceEvent } from './stateSurface.js';

type MockSurface = Pick<StateSurface, 'transition' | 'trace'>;

function createMockSurface() {
  const transition = vi.fn();
  const trace = vi.fn<[TraceEvent], void>();

  return {
    surface: { transition, trace } as MockSurface as StateSurface,
    transition,
    trace,
  };
}

describe('action delegation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('click on [data-action] triggers surface.transition with parsed params', () => {
    document.body.innerHTML = `
      <button
        id="load"
        data-action="article-load"
        data-params='{"articleId":2}'
        data-pending-targets="page:content,panel:comments"
      >
        Load
      </button>
    `;

    const { surface, transition } = createMockSurface();
    const detach = bindDeclarativeActions(surface);

    document
      .getElementById('load')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(
      'article-load',
      { articleId: 2 },
      { pendingTargets: ['page:content', 'panel:comments'] }
    );

    detach();
  });

  it('invalid data-params JSON falls back to empty params and traces error', () => {
    document.body.innerHTML = `
      <button id="load" data-action="article-load" data-params="{invalid-json}">
        Load
      </button>
    `;

    const { surface, transition, trace } = createMockSurface();
    const detach = bindDeclarativeActions(surface);

    document
      .getElementById('load')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(transition).toHaveBeenCalledWith('article-load', {}, {});
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
      })
    );

    detach();
  });

  it('form submit serializes fields and merges with data-params', () => {
    document.body.innerHTML = `
      <form
        id="search-form"
        data-action="search"
        data-params='{"source":"manual"}'
        data-pending-targets="search:results"
      >
        <input name="query" value="lithent" />
        <input name="tag" value="state" />
        <input name="tag" value="stream" />
      </form>
    `;

    const { surface, transition } = createMockSurface();
    const detach = bindDeclarativeActions(surface);

    document
      .getElementById('search-form')!
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(
      'search',
      { source: 'manual', query: 'lithent', tag: ['state', 'stream'] },
      { pendingTargets: ['search:results'] }
    );

    detach();
  });
});
