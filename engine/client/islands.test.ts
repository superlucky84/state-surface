/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { h, mount } from 'lithent';
import type { TagFunction } from 'lithent';
import { renderPage } from '../server/ssrRenderer.js';
import { createContext } from '../server/core/context.js';
import { Island } from '../shared/surfaceTree.js';
import { hydrateIslands } from './islands.js';

const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  h(tag as never, props as never, ...(children as never[]));

// Stateful island: increments a local counter on click, renders children after the button.
const Counter = mount((renew, props: { start: number }, children: unknown) => {
  let count = props.start;
  return () =>
    el(
      'div',
      { class: 'counter' },
      el('button', { type: 'button', onClick: () => (count++, renew()) }, String(count)),
      children
    );
}) as unknown as TagFunction;
const OnlyClient = ({ label }: { label: string }, children: unknown) =>
  el('p', { class: 'only' }, label, children);

const components = {
  'Counter.tsx#default': Counter,
  'OnlyClient.tsx#default': OnlyClient as unknown as TagFunction,
};

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
}

const island = (id: string, props: Record<string, unknown>, ...children: unknown[]) =>
  el(
    Island,
    { __ssComponent: components[id as keyof typeof components], __ssId: id, ...props },
    ...children
  );

describe('hydrateIslands', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('hydrates SSR islands in place with their props and static children', async () => {
    await serverRender(
      island('Counter.tsx#default', { start: 2, 'client:load': true }, el('em', {}, 'from server'))
    );
    const button = document.querySelector('button')!;
    expect(button.textContent).toBe('2');

    const cleanups = hydrateIslands(components);
    expect(cleanups).toHaveLength(1);
    expect(document.querySelector('button')).toBe(button); // SSR node reused
    expect(document.querySelector('h-children em')!.textContent).toBe('from server');

    button.click();
    await vi.waitFor(() => expect(document.querySelector('button')!.textContent).toBe('3'));
    expect(document.querySelector('em')!.textContent).toBe('from server');
  });

  it('keeps local state of several instances of one component independent', async () => {
    await serverRender(
      island('Counter.tsx#default', { start: 1, 'client:load': true }),
      island('Counter.tsx#default', { start: 10, 'client:idle': true })
    );
    hydrateIslands(components);
    const [first, second] = Array.from(document.querySelectorAll('button'));
    first.click();
    first.click();
    await vi.waitFor(() => expect(first.textContent).toBe('3'));
    expect(second.textContent).toBe('10');
    expect(
      Array.from(document.querySelectorAll<HTMLElement>('h-island'), host => host.dataset.island)
    ).toEqual(['$0', '$1']);
  });

  it('renders client:only islands, replacing the fallback and using transported children', async () => {
    await serverRender(
      island(
        'OnlyClient.tsx#default',
        { label: 'hello', 'client:only': true, fallback: el('span', {}, 'loading') },
        el('b', {}, 'kid')
      )
    );
    expect(document.body.textContent).toContain('loading');
    hydrateIslands(components);
    const host = document.querySelector('h-island')!;
    expect(host.querySelector('span')).toBeNull();
    expect(host.querySelector('template')).toBeNull();
    expect(host.querySelector('p.only')!.textContent).toBe('hellokid');
  });

  it('reports missing components and invalid props without stopping other islands', async () => {
    await serverRender(island('Counter.tsx#default', { start: 1, 'client:load': true }));
    document.body.insertAdjacentHTML(
      'beforeend',
      '<h-island data-island="$9" data-component="Missing.tsx#default" data-props="{}"></h-island>' +
        '<h-island data-island="$8" data-component="Counter.tsx#default" data-props="{bad"></h-island>'
    );
    const onError = vi.fn();
    const cleanups = hydrateIslands(components, onError);
    expect(cleanups).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0][0]).toBe('Missing.tsx#default');
  });
});
