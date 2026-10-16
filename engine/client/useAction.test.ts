/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, mount, render } from 'lithent';
import type { TagFunction } from 'lithent';
import { useAction, type ActionHandle } from './useAction.js';
import type { ActionName } from '../shared/actions.js';
import { provideRuntime } from './runtimeAccess.js';
import { ActionError, type ActionResult } from './actionError.js';
import type { StateSurface, TransitionOptions } from './stateSurface.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function fakeRuntime() {
  const calls: Array<{ name: string; params: unknown; options: TransitionOptions }> = [];
  let finish!: (result: ActionResult) => void;
  const transition = vi.fn(
    (name: string, params: unknown, options: TransitionOptions) =>
      new Promise<ActionResult>(resolve => {
        calls.push({ name, params, options });
        finish = resolve;
      })
  );
  provideRuntime(async () => ({ transition }) as unknown as StateSurface);
  return { calls, transition, finish: (result: ActionResult) => finish(result) };
}

/** Mount a component that exposes its handle and counts renders. */
function mountWithAction(name: string) {
  let handle!: ActionHandle<string>;
  let renders = 0;
  const Component = mount(renew => {
    handle = useAction(renew, name as ActionName, { pendingTargets: ['list'] });
    return () => {
      renders++;
      return h('p', {}, handle.pending ? 'pending' : handle.error ? handle.error.kind : 'idle');
    };
  }) as unknown as TagFunction;
  const el = document.createElement('div');
  document.body.append(el);
  const cleanup = render(h(Component, {}), el);
  return { el, cleanup, handle: () => handle, renders: () => renders };
}

afterEach(() => {
  provideRuntime(undefined);
  document.body.innerHTML = '';
});

describe('useAction (DESIGN 7장)', () => {
  it('tracks pending, first result and the outcome of the latest run and re-renders', async () => {
    const runtime = fakeRuntime();
    const view = mountWithAction('search');
    const result = view.handle().run({ query: 'x' });
    expect(view.handle().pending).toBe(true);
    await flush();
    expect(runtime.calls[0]).toMatchObject({
      name: 'search',
      params: { query: 'x' },
      options: { pendingTargets: ['list'] },
    });
    expect(view.el.textContent).toBe('pending');
    runtime.calls[0].options.onResult!();
    expect(view.handle().hasResult).toBe(true);
    runtime.finish({
      ok: false,
      error: new ActionError('validation', 'bad', { fieldErrors: { q: ['x'] } }),
    });
    expect(await result).toMatchObject({ ok: false, error: { kind: 'validation' } });
    await flush();
    expect(view.handle()).toMatchObject({ pending: false, aborted: false });
    expect(view.handle().error?.fieldErrors).toEqual({ q: ['x'] });
    expect(view.el.textContent).toBe('validation');
  });

  it('aborts through the signal and ignores results of an earlier run', async () => {
    const runtime = fakeRuntime();
    const view = mountWithAction('search');
    const first = view.handle().run();
    await flush();
    const second = view.handle().run();
    await flush();
    runtime.calls[0].options.onResult!();
    expect(view.handle().hasResult).toBe(false);
    view.handle().abort();
    expect(runtime.calls[1].options.signal!.aborted).toBe(true);
    expect(runtime.calls[0].options.signal!.aborted).toBe(false);
    runtime.finish({ ok: false, aborted: true });
    expect(await second).toEqual({ ok: false, aborted: true });
    expect(view.handle().aborted).toBe(true);
    void first;
  });

  it('stops re-rendering after unmount but lets the request finish', async () => {
    const runtime = fakeRuntime();
    const view = mountWithAction('search');
    const result = view.handle().run();
    await flush();
    const before = view.renders();
    view.cleanup();
    runtime.finish({ ok: true });
    expect(await result).toEqual({ ok: true });
    await flush();
    expect(view.renders()).toBe(before);
    expect(runtime.calls[0].options.signal!.aborted).toBe(false);
  });

  it('resolves with a chunk error when the runtime cannot start', async () => {
    const view = mountWithAction('search');
    expect(await view.handle().run()).toMatchObject({ ok: false, error: { kind: 'chunk' } });
  });
});
