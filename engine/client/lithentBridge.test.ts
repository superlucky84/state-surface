/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { h, mount } from 'lithent';
import type { TagFunction } from 'lithent';
import { renderToString } from 'lithent/ssr';
import { mountComponent } from './lithentBridge.js';

const Article = mount((_renew, _props: { title: string }) => {
  return (props: { title: string }) => h('div', { class: 'article' }, props.title);
}) as unknown as TagFunction;
const Card = ((props: { title: string }, children: unknown) =>
  h('section', {}, h('h2', {}, props.title), children as never)) as unknown as TagFunction;

const tick = () => new Promise(resolve => setTimeout(resolve, 20));

function host(html = '') {
  const el = document.createElement('h-state');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe('mountComponent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders into an empty host and applies props updates through Lithent', async () => {
    const el = host();
    const mounted = mountComponent(Article, { title: 'Hello' }, el, { hydrate: false });
    expect(el.innerHTML).toBe('<div class="article">Hello</div>');
    mounted.update({ title: 'Updated' });
    await tick();
    expect(el.textContent).toBe('Updated');
    expect(() => mounted.cleanup()).not.toThrow();
  });

  it('hydrates SSR DOM in place', async () => {
    const el = host(renderToString(h(Article, { title: 'SSR' })));
    const node = el.firstElementChild;
    const mounted = mountComponent(Article, { title: 'SSR' }, el, { hydrate: true });
    expect(el.firstElementChild).toBe(node);
    mounted.update({ title: 'Live' });
    await tick();
    expect(el.firstElementChild).toBe(node);
    expect(node!.textContent).toBe('Live');
  });

  it('keeps instances of one component independent', async () => {
    const first = host();
    const second = host();
    mountComponent(Article, { title: 'One' }, first, { hydrate: false });
    const other = mountComponent(Article, { title: 'Two' }, second, { hydrate: false });
    other.update({ title: 'Updated' });
    await tick();
    expect(first.textContent).toBe('One');
    expect(second.textContent).toBe('Updated');
  });

  it('passes island children as a static fragment (IC-03)', () => {
    const el = host();
    mountComponent(Card, { title: 'Card' }, el, {
      hydrate: false,
      childrenHtml: '<p>server child</p>',
    });
    expect(el.querySelector('section > h2')!.textContent).toBe('Card');
    expect(el.querySelector('section > h-children > p')!.textContent).toBe('server child');
  });
});
