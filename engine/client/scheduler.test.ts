/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { schedule } from './scheduler.js';

describe('schedule', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('runs load timing in a microtask and only once', async () => {
    const run = vi.fn();
    schedule('load', run);
    expect(run).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(run).toHaveBeenCalledOnce();
  });

  it('uses requestIdleCallback with a 2s timeout and falls back to load + 200ms', () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);
    schedule('idle', () => {});
    expect(idle.mock.calls[0][1]).toEqual({ timeout: 2000 });
    vi.unstubAllGlobals();

    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    const run = vi.fn();
    schedule('idle', run);
    vi.advanceTimersByTime(199);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledOnce();
  });

  it('observes visibility with a 200px margin and falls back to idle without observers', () => {
    const options: IntersectionObserverInit[] = [];
    let callback!: IntersectionObserverCallback;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback, init: IntersectionObserverInit) {
          callback = cb;
          options.push(init);
        }
        observe() {}
        disconnect() {}
      }
    );
    const observed: Element[] = [];
    (globalThis.IntersectionObserver as any).prototype.observe = (target: Element) =>
      observed.push(target);
    const host = document.createElement('h-island');
    host.innerHTML = '<button>child</button>';
    const run = vi.fn();
    schedule('visible', run, { element: host });
    expect(options[0].rootMargin).toBe('200px');
    expect(observed).toEqual([host, host.firstElementChild]);
    callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(run).not.toHaveBeenCalled();
    callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(run).toHaveBeenCalledOnce();
  });

  it('waits for a media query and can be cancelled', () => {
    let listener!: () => void;
    const query = {
      matches: false,
      addEventListener: (_: string, fn: () => void) => (listener = fn),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', () => query);
    const run = vi.fn();
    const cancel = schedule('media', run, { media: '(min-width: 1px)' });
    listener();
    expect(run).not.toHaveBeenCalled();
    query.matches = true;
    listener();
    expect(run).toHaveBeenCalledOnce();

    const other = vi.fn();
    query.matches = false;
    const stop = schedule('media', other, { media: '(min-width: 1px)' });
    stop();
    query.matches = true;
    listener();
    expect(other).not.toHaveBeenCalled();
    expect(cancel).toBeTypeOf('function');
  });
});
