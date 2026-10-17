/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginHost, definePlugin, type PluginDefinition } from './pluginHost.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 10));

function slots(...names: string[]) {
  document.body.innerHTML = names
    .map(name => `<h-state name="${name}"><p>${name}</p></h-state>`)
    .join('');
  return Object.fromEntries(
    names.map(name => [name, document.querySelector<HTMLElement>(`h-state[name="${name}"]`)!])
  );
}

describe('PluginHost', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('attaches a late-loaded plugin to every displayed target slot only', async () => {
    const els = slots('a', 'b', 'c');
    const calls: string[] = [];
    let release!: () => void;
    const plugin = definePlugin({
      name: 'late',
      slots: ['a', 'c'],
      attach(el, info) {
        calls.push(`attach:${info.slot}:${info.mode}:${el.textContent}`);
      },
    });
    const host = new PluginHost([{ id: 'p#late', load: 'load', slots: ['a', 'c'] }], {
      'p#late': () => new Promise<PluginDefinition>(resolve => (release = () => resolve(plugin))),
    });
    host.displayedSlot('a', els.a, 'static');
    host.displayedSlot('b', els.b, 'static');
    host.displayedSlot('c', els.c, 'client');
    host.start();
    await flush();
    host.removedSlot('c'); // gone before the chunk arrived
    release();
    await flush();
    expect(calls).toEqual(['attach:a:static:a']);
  });

  it('runs cleanup before removal, update for same DOM, and re-attaches new DOM', async () => {
    const els = slots('chat');
    const calls: string[] = [];
    const plugin = definePlugin({
      name: 'scroll',
      attach(_el, info) {
        calls.push(`attach:${info.slot}`);
        return () => calls.push(`cleanup:${info.slot}`);
      },
      update(_el, info) {
        calls.push(`update:${info.slot}`);
      },
    });
    const host = new PluginHost([{ id: 'p#scroll', load: 'load' }], {
      'p#scroll': async () => plugin,
    });
    host.start();
    await flush();
    host.displayedSlot('chat', els.chat, 'client');
    host.updatedSlot('chat');
    host.removedSlot('chat');
    host.displayedSlot('chat', els.chat, 'client');
    expect(calls).toEqual(['attach:chat', 'update:chat', 'cleanup:chat', 'attach:chat']);
  });

  it('calls onPage once, forwards actions and isolates throwing hooks', async () => {
    const report = vi.fn();
    const onPage = vi.fn();
    const onAction = vi.fn();
    const broken = definePlugin({
      name: 'broken',
      attach() {
        throw new Error('attach failed');
      },
    });
    const host = new PluginHost(
      [
        { id: 'p#ok', load: 'load' },
        { id: 'p#broken', load: 'load' },
        { id: 'p#missing', load: 'load' },
      ],
      {
        'p#ok': async () => definePlugin({ name: 'ok', onPage, onAction }),
        'p#broken': async () => broken,
      },
      report
    );
    host.start();
    await flush();
    host.displayedSlot('x', document.createElement('h-state'), 'static');
    host.action({ name: 'search', phase: 'start' });
    expect(onPage).toHaveBeenCalledOnce();
    expect(onPage.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(onAction).toHaveBeenCalledWith({ name: 'search', phase: 'start' });
    expect(report).toHaveBeenCalledTimes(2); // missing chunk + throwing attach
  });

  it('waits for idle before loading idle plugins', async () => {
    let idle!: () => void;
    vi.stubGlobal('requestIdleCallback', (run: () => void) => ((idle = run), 1));
    const loader = vi.fn(async () => definePlugin({ name: 'idle' }));
    new PluginHost([{ id: 'p#idle', load: 'idle' }], { 'p#idle': loader }).start();
    await flush();
    expect(loader).not.toHaveBeenCalled();
    idle();
    expect(loader).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('requires a plugin name', () => {
    expect(() => definePlugin({} as PluginDefinition)).toThrow('needs a `name`');
  });

  it('cleans up replaced slots, keeps persisted ones and runs onPage once per page (DC-18)', async () => {
    const els = slots('chat', 'body');
    const calls: string[] = [];
    const signals: AbortSignal[] = [];
    const plugin = definePlugin({
      name: 'track',
      attach(_el, info) {
        calls.push(`attach:${info.slot}`);
        return () => calls.push(`cleanup:${info.slot}`);
      },
      update(_el, info) {
        calls.push(`update:${info.slot}`);
      },
      onPage(page) {
        signals.push(page.signal);
        calls.push('page');
      },
    });
    const loader = vi.fn(async () => plugin);
    const host = new PluginHost([{ id: 'p#track', load: 'load' }], { 'p#track': loader });
    host.displayedSlot('chat', els.chat, 'client');
    host.displayedSlot('body', els.body, 'server');
    host.start();
    await flush();
    expect(calls).toEqual(['page', 'attach:chat', 'attach:body']);
    calls.length = 0;
    host.leavePage(new Set(['chat']));
    expect(calls).toEqual(['cleanup:body']);
    expect(signals[0].aborted).toBe(true);
    calls.length = 0;
    host.mountPage([{ id: 'p#track', load: 'load' }]);
    host.displayedSlot('next', document.createElement('h-state'), 'server');
    await flush();
    // The module loads once; the persisted slot is updated, the new one attached.
    expect(loader).toHaveBeenCalledOnce();
    expect(calls).toEqual(['page', 'update:chat', 'attach:next']);
    // A page that does not declare the plugin cleans up its persisted attachment.
    calls.length = 0;
    host.leavePage(new Set(['chat']));
    host.mountPage([]);
    expect(calls).toEqual(['cleanup:next', 'cleanup:chat']);
    expect(host.stats).toMatchObject({ plugins: 0, modules: 1 });
  });

  it('warns in development when a plugin changes DOM that Lithent owns (DESIGN 3.1)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML =
      '<h-state name="chat"><p>client</p></h-state>' +
      '<h-state name="page"><p>static</p><h-island data-island="$1"><b>island</b></h-island></h-state>';
    const chat = document.querySelector<HTMLElement>('h-state[name="chat"]')!;
    const page = document.querySelector<HTMLElement>('h-state[name="page"]')!;
    const plugin = definePlugin({
      name: 'meddler',
      attach(el, info) {
        el.setAttribute('data-enhanced', ''); // the slot element itself: allowed
        if (info.slot === 'page') el.querySelector('p')!.textContent = 'enhanced'; // static: allowed
        if (info.slot === 'page') el.querySelector('b')!.textContent = 'changed'; // island
        if (info.slot === 'chat') el.querySelector('p')!.classList.add('x'); // client slot
      },
    });
    const host = new PluginHost(
      [{ id: 'p#m', load: 'load' }],
      { 'p#m': async () => plugin },
      () => {},
      true
    );
    host.displayedSlot('chat', chat, 'client');
    host.displayedSlot('page', page, 'static');
    host.start();
    await flush();
    expect(warn.mock.calls.map(call => call[0])).toEqual([
      expect.stringContaining(
        'plugin "meddler" changed DOM inside client slot "chat" during attach'
      ),
      expect.stringContaining('plugin "meddler" changed DOM inside an island of slot "page"'),
    ]);

    warn.mockClear();
    const quiet = definePlugin({ name: 'quiet', attach: el => el.setAttribute('data-x', '') });
    const production = new PluginHost(
      [{ id: 'p#q', load: 'load' }],
      { 'p#q': async () => ({ ...plugin, name: 'prod' }) },
      () => {},
      false
    );
    production.displayedSlot('chat', chat, 'client');
    production.start();
    const allowed = new PluginHost(
      [{ id: 'p#q', load: 'load' }],
      { 'p#q': async () => quiet },
      () => {},
      true
    );
    allowed.displayedSlot('chat', chat, 'client');
    allowed.start();
    await flush();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
