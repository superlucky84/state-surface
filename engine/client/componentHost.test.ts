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
  const state = html.match(/<script id="__STATE__" type="application\/json">(.*?)<\/script>/);
  return state ? JSON.parse(state[1]) : {};
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

function host(
  states: Record<string, unknown>,
  loaders: Record<string, TagFunction>,
  plugins?: PluginHost
) {
  const requested: string[] = [];
  const instance = new ComponentHost({
    states,
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
    const states = await serverRender(slot('count', Counter, { start: 2, label: 'a' }));
    const button = document.querySelector('button')!;
    const plugins = new PluginHost([], {});
    const displayed = vi.spyOn(plugins, 'displayedSlot');
    const { host: components, requested } = host(states, { 'count.tsx#default': Counter }, plugins);
    components.scan();
    await flush();
    expect(requested).toEqual(['count.tsx#default']);
    expect(document.querySelector('button')).toBe(button);
    expect(displayed).toHaveBeenCalledWith('count', expect.any(HTMLElement), 'client');

    button.click();
    await flush();
    components
      .callbacks()
      .updateTemplate('count', { start: 2, label: 'b' }, document.querySelector('h-state')!);
    await flush();
    expect(button.textContent).toBe('3');
    expect(document.querySelector('.label')!.textContent).toBe('b');
  });

  it('does not request client:visible chunks before the element is visible', async () => {
    const states = await serverRender(
      slot('later', Counter, { start: 1 }, { 'client:load': undefined, 'client:visible': true })
    );
    expect(document.querySelector('h-state')!.getAttribute('data-activation')).toBe('visible');
    const { host: components, requested } = host(states, { 'later.tsx#default': Counter });
    components.scan();
    await flush();
    expect(requested).toEqual([]);
    FakeIntersectionObserver.instances[0].reveal();
    await flush();
    expect(requested).toEqual(['later.tsx#default']);
  });

  it('activates a dormant slot when a frame arrives and applies the latest data after the SSR snapshot', async () => {
    const states = await serverRender(
      slot(
        'later',
        Counter,
        { start: 1, label: 'ssr' },
        { 'client:load': undefined, 'client:visible': true }
      )
    );
    const ssrButton = document.querySelector('button');
    const { host: components, requested } = host(states, { 'later.tsx#default': Counter });
    components.scan();
    const anchor = document.querySelector<HTMLElement>('h-state')!;
    components.callbacks().updateTemplate('later', { start: 1, label: 'first' }, anchor);
    components.callbacks().updateTemplate('later', { start: 1, label: 'latest' }, anchor);
    await flush();
    expect(requested).toEqual(['later.tsx#default']);
    expect(document.querySelector('button')).toBe(ssrButton);
    expect(document.querySelector('.label')!.textContent).toBe('latest');
  });

  it('renders empty slots on the first frame and never mounts a slot removed while loading', async () => {
    document.body.innerHTML =
      '<h-state name="title" data-component="title.tsx#default"></h-state>' +
      '<h-state name="gone" data-component="title.tsx#default" data-activation="idle"></h-state>';
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const components = new ComponentHost({
      states: {},
      loaders: { 'title.tsx#default': () => gate.then(() => Title) },
    });
    components.scan();
    const [title, gone] = Array.from(document.querySelectorAll<HTMLElement>('h-state'));
    const callbacks = components.callbacks();
    callbacks.renderTemplate('title', { text: 'Hello' }, title);
    callbacks.renderTemplate('gone', { text: 'Never' }, gone);
    callbacks.unmountTemplate('gone', gone);
    release();
    await flush();
    expect(title.innerHTML).toBe('<h1>Hello</h1>');
    expect(gone.innerHTML).toBe('');
  });

  it('keeps SSR HTML when a chunk fails and shows a fallback only for slots without content', async () => {
    const states = await serverRender(slot('kept', Title, { text: 'SSR' }));
    document.body.insertAdjacentHTML(
      'beforeend',
      '<h-state name="empty" data-component="missing.tsx#default"></h-state>'
    );
    const report = vi.fn();
    const components = new ComponentHost({
      states,
      loaders: { 'kept.tsx#default': () => Promise.reject(new Error('chunk 404')) },
      report,
    });
    components.scan();
    components
      .callbacks()
      .renderTemplate(
        'empty',
        { text: 'x' },
        document.querySelector<HTMLElement>('h-state[name="empty"]')!
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
    await serverRender(
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
    const { host: components } = host(
      {},
      { 'Counter.tsx#default': Counter, 'Only.tsx#default': OnlyClient }
    );
    components.scan();
    await flush();
    const [first, second] = Array.from(document.querySelectorAll('button'));
    first.click();
    await flush();
    expect(first.textContent).toBe('2');
    expect(second.textContent).toBe('10');
    expect(document.querySelector('h-children em')!.textContent).toBe('kid');
    const only = document.querySelector('h-island[data-only]')!;
    expect(only.querySelector('span')).toBeNull();
    expect(only.querySelector('template')).toBeNull();
    expect(only.querySelector('p.only')!.textContent).toBe('hi!');
  });

  it('treats only slots with data-component as updatable', () => {
    const { host: components } = host({}, {});
    const callbacks = components.callbacks();
    const client = document.createElement('h-state');
    client.setAttribute('data-component', 'x');
    expect(callbacks.isUpdatable('a', client)).toBe(true);
    expect(callbacks.isUpdatable('b', document.createElement('h-state'))).toBe(false);
  });
});
