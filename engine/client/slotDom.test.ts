/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, mount } from 'lithent';
import type { TagFunction } from 'lithent';
import { SlotDom } from './slotDom.js';
import { ComponentHost } from './componentHost.js';
import { PluginHost } from './pluginHost.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 30));
// Island with local state: clicks increment a count the server never sees.
const Counter = mount((renew, props: { start: number }) => {
  let count = props.start;
  return () => h('button', { type: 'button', onClick: () => (count++, renew()) }, String(count));
}) as unknown as TagFunction;
const islandHtml = (id: string, start: number) =>
  `<h-island data-island="${id}" style="display:contents"><button type="button">${start}</button></h-island>`;

function setup() {
  document.body.innerHTML = '<h-state name="panel"></h-state>';
  const el = document.querySelector<HTMLElement>('h-state')!;
  const plugins = new PluginHost([], {});
  const calls = {
    displayed: vi.spyOn(plugins, 'displayedSlot'),
    removed: vi.spyOn(plugins, 'removedSlot'),
    updated: vi.spyOn(plugins, 'updatedSlot'),
  };
  const host = new ComponentHost({ loaders: { 'Counter#default': async () => Counter }, plugins });
  const dom = new SlotDom(host, plugins, { development: true });
  return { el, dom, host, calls };
}

afterEach(() => vi.restoreAllMocks());

describe('swap="replace" (DC-03)', () => {
  it('cleans up plugins, replaces HTML, restores focus, selection and scroll by id, then attaches', async () => {
    const { el, dom, calls } = setup();
    el.innerHTML =
      '<input id="q" value="hello world"><div id="list" style="height:20px;overflow:auto"><p style="height:200px">x</p></div>';
    const input = el.querySelector('input')!;
    input.focus();
    input.setSelectionRange(2, 5);
    el.querySelector<HTMLElement>('#list')!.scrollTop = 40;
    await dom.html(
      el,
      'panel',
      '<input id="q" value="hello world"><div id="list" style="height:20px;overflow:auto"><p style="height:200px">y</p></div>'
    );
    const next = el.querySelector('input')!;
    expect(next).not.toBe(input);
    expect(document.activeElement).toBe(next);
    expect([next.selectionStart, next.selectionEnd]).toEqual([2, 5]);
    expect(el.querySelector<HTMLElement>('#list')!.scrollTop).toBe(40);
    expect(calls.removed).toHaveBeenCalledWith('panel');
    expect(calls.displayed).toHaveBeenCalledWith('panel', el, 'server');
    expect(calls.removed.mock.invocationCallOrder[0]).toBeLessThan(
      calls.displayed.mock.invocationCallOrder[0]
    );
  });

  it('disposes islands of the old HTML and activates the islands of the new one (DC-08)', async () => {
    const { el, dom, host } = setup();
    await dom.html(el, 'panel', islandHtml('panel$0', 1), [
      { id: 'panel$0', component: 'Counter#default', props: { start: 1 } },
    ]);
    await flush();
    el.querySelector('button')!.click();
    await flush();
    expect(el.querySelector('button')!.textContent).toBe('2');
    await dom.html(el, 'panel', islandHtml('panel$0', 1), [
      { id: 'panel$0', component: 'Counter#default', props: { start: 1 } },
    ]);
    await flush();
    // Replace recreates the island: local state starts over.
    expect(el.querySelector('button')!.textContent).toBe('1');
    expect(host.has('panel$0')).toBe(true);
  });

  it('never runs scripts in applied HTML and warns in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { el, dom } = setup();
    (window as unknown as { __ran?: boolean }).__ran = false;
    await dom.html(el, 'panel', '<p>x</p><script>window.__ran = true</script>');
    expect((window as unknown as { __ran?: boolean }).__ran).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('does not run'));
  });
});

describe('swap="morph" (DC-03 ③, IC-06)', () => {
  it('keeps an unchanged island and the focused input; replaces a changed island', async () => {
    const { el, dom, host, calls } = setup();
    const islands = (a: number, b: number) => [
      { id: 'panel$0', component: 'Counter#default', props: { start: a } },
      { id: 'panel$1', component: 'Counter#default', props: { start: b } },
    ];
    const html = (a: number, b: number, label: string) =>
      `<input id="q" value=""><p>${label}</p>${islandHtml('panel$0', a)}${islandHtml('panel$1', b)}`;
    await dom.html(el, 'panel', html(1, 10, 'before'), islands(1, 10), 'morph');
    await flush();
    const [kept, changed] = Array.from(el.querySelectorAll('button'));
    kept.click();
    changed.click();
    await flush();
    expect([kept.textContent, changed.textContent]).toEqual(['2', '11']);
    const input = el.querySelector('input')!;
    input.value = 'typed';
    input.focus();

    await dom.html(el, 'panel', html(1, 20, 'after'), islands(1, 20), 'morph');
    await flush();
    expect(el.querySelector('p')!.textContent).toBe('after');
    expect(el.querySelector('input')).toBe(input);
    expect(input.value).toBe('typed');
    expect(document.activeElement).toBe(input);
    const [first, second] = Array.from(el.querySelectorAll('button'));
    expect(first).toBe(kept);
    expect(first.textContent).toBe('2'); // same component + props: instance kept
    expect(second.textContent).toBe('20'); // props changed: new instance from new HTML
    expect(host.has('panel$1')).toBe(true);
    expect(calls.updated).toHaveBeenCalledWith('panel');
  });
});

describe('remove and UI', () => {
  it('removes content, islands and UI of a server slot', async () => {
    const { el, dom, host, calls } = setup();
    await dom.html(el, 'panel', islandHtml('panel$0', 1), [
      { id: 'panel$0', component: 'Counter#default', props: { start: 1 } },
    ]);
    dom.setUi(el, 'panel', { classAdd: ['on'], cssVars: { '--x': '1' } });
    dom.remove(el, 'panel', 'server');
    expect(el.innerHTML).toBe('');
    expect(el.className).toBe('');
    expect(el.style.getPropertyValue('--x')).toBe('');
    expect(host.has('panel$0')).toBe(false);
    expect(calls.removed).toHaveBeenLastCalledWith('panel');
  });

  it('replaces the previous UI patch of the slot', () => {
    const { el, dom } = setup();
    el.className = 'base';
    dom.setUi(el, 'panel', { classAdd: ['a'], cssVars: { '--x': '1' } });
    dom.setUi(el, 'panel', { classAdd: ['b'], classRemove: ['base'] });
    expect(el.className).toBe('b');
    expect(el.style.getPropertyValue('--x')).toBe('');
  });

  it('regression: a new patch restores what the previous one changed on the SSR host', () => {
    const { el, dom } = setup();
    el.className = 'card on';
    el.style.setProperty('--x', '0');
    // Removing and re-adding SSR classes, overriding an SSR variable…
    dom.setUi(el, 'panel', {
      classRemove: ['card'],
      classAdd: ['on', 'hot'],
      cssVars: { '--x': '9' },
    });
    expect([...el.classList].sort()).toEqual(['hot', 'on']);
    expect(el.style.getPropertyValue('--x')).toBe('9');
    // …is undone by the next patch: same result as if only that patch had been applied.
    dom.setUi(el, 'panel', { classAdd: ['cold'] });
    expect([...el.classList].sort()).toEqual(['card', 'cold', 'on']);
    expect(el.style.getPropertyValue('--x')).toBe('0');
    dom.setUi(el, 'panel', null);
    expect([...el.classList].sort()).toEqual(['card', 'on']);
  });
});
