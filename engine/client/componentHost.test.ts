/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { h, mount } from 'lithent';
import type { TagFunction } from 'lithent';
import { ComponentHost } from './componentHost.js';
import { PluginHost } from './pluginHost.js';
import { renderPage } from '../server/ssrRenderer.js';
import { createContext } from '../server/core/context.js';
import { Island, Slot } from '../shared/surfaceTree.js';
import type { SlotMeta } from '../shared/protocol.js';

const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  h(tag as never, props as never, ...(children as never[]));

// Stateful counter: local count survives props updates; children follow the button.
const Counter = mount((renew, props: { start: number; label?: string }, children: unknown) => {
  let count = props.start;
  return (next: { start: number; label?: string }) =>
    el(
      'div',
      { class: 'counter' },
      el('button', { type: 'button', onClick: () => (count++, renew()) }, String(count)),
      el('span', { class: 'label' }, next.label ?? ''),
      children
    );
}) as unknown as TagFunction;
const Title = ((props: { text: string }) => el('h1', {}, props.text)) as unknown as TagFunction;

const flush = () => new Promise(resolve => setTimeout(resolve, 30));

async function serverRender(...body: unknown[]) {
  const ctx = createContext(new Request('https://surface.test/'), {
    basePath: '',
    signal: new AbortController().signal,
  }).ctx;
  const html = await renderPage(
    { default: () => el('html', {}, el('head', {}), el('body', {}, ...body)) },
    ctx
  );
  document.body.innerHTML = html.slice(
    html.indexOf('<!--ss:body-->'),
    html.indexOf('<!--/ss:body-->')
  );
  const bootstrap = html.match(/<script id="__SURFACE__" type="application\/json">(.*?)<\/script>/);
  return (bootstrap ? JSON.parse(bootstrap[1]).slots : []) as SlotMeta[];
}

const slot = (name: string, component: TagFunction, props: Record<string, unknown>, extra = {}) =>
  el(
    Slot,
    { name, 'client:load': true, ...extra },
    el(Island, { __ssComponent: component, __ssId: `${name}.tsx#default`, ...props })
  );
const island = (
  id: string,
  component: TagFunction,
  props: Record<string, unknown>,
  ...children: unknown[]
) => el(Island, { __ssComponent: component, __ssId: id, ...props }, ...children);

function host(loaders: Record<string, TagFunction>, plugins?: PluginHost) {
  const requested: string[] = [];
  const instance = new ComponentHost({
    plugins,
    loaders: Object.fromEntries(
      Object.entries(loaders).map(([id, component]) => [
        id,
        () => {
          requested.push(id);
          return Promise.resolve(component);
        },
      ])
    ),
    report: () => {},
  });
  return { host: instance, requested };
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  elements: Element[] = [];
  constructor(private callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(element: Element) {
    this.elements.push(element);
  }
  disconnect() {}
  reveal() {
    this.callback(
      this.elements.map(target => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver
    );
  }
}

describe('ComponentHost', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hydrates client:load slots in place and keeps local state across props updates', async () => {
    const slots = await serverRender(slot('count', Counter, { start: 2, label: 'a' }));
    const button = document.querySelector('button')!;
    const plugins = new PluginHost([], {});
    const displayed = vi.spyOn(plugins, 'displayedSlot');
    const { host: components, requested } = host({ 'count.tsx#default': Counter }, plugins);
    components.scan(document, slots);
    await flush();
    expect(requested).toEqual(['count.tsx#default']);
    expect(document.querySelector('button')).toBe(button);
    expect(displayed).toHaveBeenCalledWith('count', expect.any(HTMLElement), 'client');

    button.click();
    await flush();
    components.setProps(
      'count',
      document.querySelector('h-state')!,
      { start: 2, label: 'b' },
      slots[0]
    );
    await flush();
    expect(button.textContent).toBe('3');
    expect(document.querySelector('.label')!.textContent).toBe('b');
  });

  it('does not request client:visible chunks before the element is visible', async () => {
    const slots = await serverRender(
      slot('later', Counter, { start: 1 }, { 'client:load': undefined, 'client:visible': true })
    );
    expect(slots[0]).toMatchObject({ id: 'later', activation: 'visible' });
    expect(document.querySelector('h-state')!.hasAttribute('data-activation')).toBe(false);
    const { host: components, requested } = host({ 'later.tsx#default': Counter });
    components.scan(document, slots);
    await flush();
    expect(requested).toEqual([]);
    FakeIntersectionObserver.instances[0].reveal();
    await flush();
    expect(requested).toEqual(['later.tsx#default']);
  });

  it('keeps the latest data of a dormant slot and hydrates the SSR snapshot before it on activation', async () => {
    const slots = await serverRender(
      slot(
        'later',
        Counter,
        { start: 1, label: 'ssr' },
        { 'client:load': undefined, 'client:visible': true }
      )
    );
    const ssrButton = document.querySelector('button');
    const { host: components, requested } = host({ 'later.tsx#default': Counter });
    components.scan(document, slots);
    const anchor = document.querySelector<HTMLElement>('h-state')!;
    expect(components.setProps('later', anchor, { start: 1, label: 'first' }, slots[0])).toBe(
      'deferred'
    );
    components.setProps('later', anchor, { start: 1, label: 'latest' }, slots[0]);
    await flush();
    // DESIGN 5.3 ③: a frame does not force the load of a dormant slot.
    expect(requested).toEqual([]);
    expect(document.querySelector('.label')!.textContent).toBe('ssr');
    FakeIntersectionObserver.instances[0].reveal();
    await flush();
    expect(requested).toEqual(['later.tsx#default']);
    expect(document.querySelector('button')).toBe(ssrButton);
    expect(document.querySelector('.label')!.textContent).toBe('latest');
  });

  it('activates a dormant boundary on pointerdown, focusin or keydown without replaying it', async () => {
    const slots = await serverRender(
      slot('a', Counter, { start: 1 }, { 'client:load': undefined, 'client:visible': true }),
      slot('b', Counter, { start: 5 }, { 'client:load': undefined, 'client:idle': true })
    );
    vi.stubGlobal('requestIdleCallback', () => 1);
    const { host: components, requested } = host({
      'a.tsx#default': Counter,
      'b.tsx#default': Counter,
    });
    components.scan(document, slots);
    const [first, second] = Array.from(document.querySelectorAll('button'));
    first.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    second.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await flush();
    expect(requested).toEqual(['a.tsx#default', 'b.tsx#default']);
    expect(first.textContent).toBe('1');
    first.click();
    await flush();
    expect(first.textContent).toBe('2');
  });

  it('retries a failed chunk once, then reports it and calls onChunkError', async () => {
    const slots = await serverRender(
      slot('flaky', Title, { text: 'SSR' }),
      slot('broken', Title, { text: 'kept' })
    );
    let attempts = 0;
    const onChunkError = vi.fn();
    const report = vi.fn();
    const components = new ComponentHost({
      loaders: {
        'flaky.tsx#default': () =>
          ++attempts === 1 ? Promise.reject(new Error('network')) : Promise.resolve(Title),
        'broken.tsx#default': () => Promise.reject(new Error('chunk 404')),
      },
      report,
      onChunkError,
      retryDelay: 5,
    });
    components.scan(document, slots);
    await flush();
    expect(attempts).toBe(2);
    const flaky = document.querySelector<HTMLElement>('h-state[name="flaky"]')!;
    expect(components.setProps('flaky', flaky, { text: 'live' }, slots[0])).toBe('applied');
    await flush();
    expect(flaky.innerHTML).toBe('<h1>live</h1>');
    expect(document.querySelector('h-state[name="broken"]')!.innerHTML).toBe('<h1>kept</h1>');
    expect(report).toHaveBeenCalledOnce();
    expect(onChunkError).toHaveBeenCalledOnce();
    const broken = document.querySelector<HTMLElement>('h-state[name="broken"]')!;
    expect(components.setProps('broken', broken, { text: 'x' }, slots[1])).toBe('failed');
  });

  it('remounts on reset and on a resetKey change, and keeps local state otherwise (DC-05)', async () => {
    const slots = await serverRender(
      slot('editor', Counter, { start: 1, label: 'a', id: 1 }, { resetKey: 'id' })
    );
    expect(slots[0].resetKey).toEqual(['id']);
    const { host: components } = host({ 'editor.tsx#default': Counter });
    components.scan(document, slots);
    await flush();
    const anchor = document.querySelector<HTMLElement>('h-state')!;
    const button = () => document.querySelector('button')!;
    button().click();
    await flush();
    expect(button().textContent).toBe('2');
    components.setProps('editor', anchor, { start: 1, label: 'b', id: 1 }, slots[0]);
    await flush();
    expect(button().textContent).toBe('2');
    expect(document.querySelector('.label')!.textContent).toBe('b');
    components.setProps('editor', anchor, { start: 7, label: 'c', id: 2 }, slots[0]);
    await flush();
    expect(button().textContent).toBe('7');
    button().click();
    await flush();
    components.setProps('editor', anchor, { start: 3, label: 'd', id: 2 }, slots[0], {
      reset: true,
    });
    await flush();
    expect(button().textContent).toBe('3');
  });

  it('mounts fresh instead of hydrating when a dormant slot was reset', async () => {
    const slots = await serverRender(
      slot('later', Counter, { start: 1 }, { 'client:load': undefined, 'client:visible': true })
    );
    const ssrButton = document.querySelector('button');
    const { host: components } = host({ 'later.tsx#default': Counter });
    components.scan(document, slots);
    const anchor = document.querySelector<HTMLElement>('h-state')!;
    components.setProps('later', anchor, { start: 9 }, slots[0], { reset: true });
    FakeIntersectionObserver.instances[0].reveal();
    await flush();
    expect(document.querySelector('button')).not.toBe(ssrButton);
    expect(document.querySelector('button')!.textContent).toBe('9');
  });

  it('renders empty slots on the first frame and never mounts a slot removed while loading', async () => {
    document.body.innerHTML = '<h-state name="title"></h-state><h-state name="gone"></h-state>';
    const slots: SlotMeta[] = [
      { id: 'title', mode: 'client', component: 'title.tsx#default' },
      { id: 'gone', mode: 'client', component: 'title.tsx#default', activation: 'idle' },
    ];
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const components = new ComponentHost({
      loaders: { 'title.tsx#default': () => gate.then(() => Title) },
    });
    components.scan(document, slots);
    const [title, gone] = Array.from(document.querySelectorAll<HTMLElement>('h-state'));
    components.setProps('title', title, { text: 'Hello' }, slots[0]);
    components.setProps('gone', gone, { text: 'Never' }, slots[1]);
    components.remove('gone');
    release();
    await flush();
    expect(title.innerHTML).toBe('<h1>Hello</h1>');
    expect(gone.innerHTML).toBe('');
  });

  it('keeps SSR HTML when a chunk fails and shows a fallback only for slots without content', async () => {
    const slots = await serverRender(slot('kept', Title, { text: 'SSR' }));
    document.body.insertAdjacentHTML('beforeend', '<h-state name="empty"></h-state>');
    const report = vi.fn();
    const components = new ComponentHost({
      loaders: { 'kept.tsx#default': () => Promise.reject(new Error('chunk 404')) },
      report,
      retryDelay: 0,
    });
    const empty: SlotMeta = { id: 'empty', mode: 'client', component: 'missing.tsx#default' };
    components.scan(document, [...slots, empty]);
    components.setProps(
      'empty',
      document.querySelector<HTMLElement>('h-state[name="empty"]')!,
      { text: 'x' },
      empty
    );
    await flush();
    expect(document.querySelector('h-state[name="kept"]')!.innerHTML).toBe('<h1>SSR</h1>');
    expect(
      document.querySelector('h-state[name="empty"] [data-error="template-fallback"]')
    ).toBeTruthy();
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('hydrates islands with static children and renders client:only islands (V-03)', async () => {
    const OnlyClient = vi.fn(((props: { label: string }, children: unknown) =>
      el('p', { class: 'only' }, props.label, children as never)) as unknown as TagFunction);
    const slots = await serverRender(
      island(
        'Counter.tsx#default',
        Counter,
        { start: 1, 'client:load': true },
        el('em', {}, 'kid')
      ),
      island('Counter.tsx#default', Counter, { start: 10, 'client:idle': true }),
      island(
        'Only.tsx#default',
        OnlyClient,
        { label: 'hi', 'client:only': true, fallback: el('span', {}, 'loading') },
        el('b', {}, '!')
      )
    );
    expect(OnlyClient).not.toHaveBeenCalled();
    vi.stubGlobal('requestIdleCallback', (run: () => void) => (setTimeout(run, 0), 1));
    const { host: components } = host({
      'Counter.tsx#default': Counter,
      'Only.tsx#default': OnlyClient,
    });
    components.scan(document, slots);
    await flush();
    const [first, second] = Array.from(document.querySelectorAll('button'));
    first.click();
    await flush();
    expect(first.textContent).toBe('2');
    expect(second.textContent).toBe('10');
    expect(document.querySelector('h-children em')!.textContent).toBe('kid');
    const only = document.querySelector('h-island[data-island="$2"]')!;
    expect(only.querySelector('span')).toBeNull();
    expect(only.querySelector('template')).toBeNull();
    expect(only.querySelector('p.only')!.textContent).toBe('hi!');
  });

  it('adopts islands of new server HTML and disposes islands of replaced HTML (DC-08)', async () => {
    document.body.innerHTML = '<h-state name="panel"></h-state>';
    const panel = document.querySelector<HTMLElement>('h-state')!;
    const { host: components, requested } = host({ 'Counter.tsx#default': Counter });
    panel.innerHTML =
      '<h-island data-island="panel$0" style="display:contents"><div class="counter"><button type="button">5</button><span class="label"></span></div></h-island>';
    const meta = { id: 'panel$0', component: 'Counter.tsx#default', props: { start: 5 } };
    components.adopt(panel, [meta]);
    await flush();
    expect(requested).toEqual(['Counter.tsx#default']);
    panel.querySelector('button')!.click();
    await flush();
    expect(panel.querySelector('button')!.textContent).toBe('6');
    // IC-06: same component and props → the instance may be kept; different → not.
    expect(components.sameIsland('panel$0', meta)).toBe(true);
    expect(components.sameIsland('panel$0', { ...meta, props: { start: 6 } })).toBe(false);
    components.rekey('panel$0', 'panel$1');
    expect(panel.querySelector('h-island')!.getAttribute('data-island')).toBe('panel$1');
    components.disposeWithin(panel);
    expect(components.has('panel$1')).toBe(false);
  });

  it('keeps a morphed island whose resetKey values are unchanged and updates its props', async () => {
    document.body.innerHTML = '<h-state name="panel"></h-state>';
    const panel = document.querySelector<HTMLElement>('h-state')!;
    const { host: components } = host({ 'Counter.tsx#default': Counter });
    panel.innerHTML =
      '<h-island data-island="panel$0" style="display:contents"><div class="counter"><button type="button">1</button><span class="label">a</span></div></h-island>';
    const meta = {
      id: 'panel$0',
      component: 'Counter.tsx#default',
      props: { start: 1, label: 'a', id: 'x' },
      resetKey: ['id'],
    };
    components.adopt(panel, [meta]);
    await flush();
    panel.querySelector('button')!.click();
    await flush();
    const next = { ...meta, id: 'panel$1', props: { start: 1, label: 'b', id: 'x' } };
    expect(components.keepIsland('panel$0', next)).toBe(true);
    await flush();
    expect(panel.querySelector('button')!.textContent).toBe('2');
    expect(panel.querySelector('.label')!.textContent).toBe('b');
    expect(components.keepIsland('panel$1', { ...next, props: { start: 1, id: 'y' } })).toBe(false);
  });
});
