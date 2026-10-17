/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PluginRelay } from './pluginRelay.js';
import { PluginHost, definePlugin, type PagePluginEntry } from './pluginHost.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function relayWith(plugin = definePlugin({ name: 'probe' })) {
  const attached: string[] = [];
  const cleaned: string[] = [];
  const definition = definePlugin({
    ...plugin,
    attach: (_el, info) => {
      attached.push(info.slot);
      return () => cleaned.push(info.slot);
    },
  });
  const load = vi.fn(async () => ({
    createPluginHost: (entries: PagePluginEntry[], report: () => void) =>
      new PluginHost(entries, { probe: async () => definition }, report),
  }));
  return { relay: new PluginRelay(load, () => {}), load, attached, cleaned };
}
const slot = (name: string) => {
  const el = document.createElement('h-state');
  el.setAttribute('name', name);
  document.body.append(el);
  return el;
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('PluginRelay (DC-12, DC-17 loader size)', () => {
  it('never loads the plugin host on pages without plugins', async () => {
    const { relay, load } = relayWith();
    relay.mountPage([]);
    relay.displayedSlot('a', slot('a'), 'static');
    relay.action({ name: 'x', phase: 'start' });
    await tick();
    expect(load).not.toHaveBeenCalled();
  });

  it('loads at once for `load` plugins and attaches to slots displayed before', async () => {
    const { relay, load, attached } = relayWith();
    relay.displayedSlot('a', slot('a'), 'static');
    relay.displayedSlot('b', slot('b'), 'server');
    relay.removedSlot('b');
    relay.mountPage([{ id: 'probe', load: 'load' }]);
    await vi.waitFor(() => expect(attached).toEqual(['a']));
    expect(load).toHaveBeenCalledOnce();
    expect(relay.loaded).toBeInstanceOf(PluginHost);
  });

  it('waits for idle otherwise and forgets non-persisted slots when the page is left', async () => {
    let idle: (() => void) | undefined;
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idle = callback;
      return 1;
    });
    vi.stubGlobal('cancelIdleCallback', () => (idle = undefined));
    const { relay, load, attached } = relayWith();
    relay.displayedSlot('kept', slot('kept'), 'client');
    relay.displayedSlot('gone', slot('gone'), 'static');
    relay.mountPage([{ id: 'probe', load: 'idle' }]);
    await tick();
    expect(load).not.toHaveBeenCalled();
    // A client navigation before idle: the schedule is cancelled, persisted slots stay.
    relay.leavePage(new Set(['kept']));
    expect(idle).toBeUndefined();
    // `visible` plugins also get the host at idle; the host then waits for visibility itself.
    relay.mountPage([{ id: 'probe', load: 'visible' }]);
    expect(idle).toBeDefined();
    const relayIdle = idle!;
    idle = undefined;
    relayIdle();
    await vi.waitFor(() => expect(relay.loaded).toBeDefined());
    expect(load).toHaveBeenCalledOnce();
    relay.leavePage(new Set(['kept']));
    relay.mountPage([{ id: 'probe', load: 'idle' }]);
    await vi.waitFor(() => expect(idle).toBeDefined());
    idle!();
    await vi.waitFor(() => expect(attached).toEqual(['kept']));
  });

  it('hands page changes and slot events to the host once it exists', async () => {
    const { relay, attached, cleaned } = relayWith();
    relay.mountPage([{ id: 'probe', load: 'load' }]);
    await vi.waitFor(() => expect(relay.loaded).toBeDefined());
    relay.displayedSlot('a', slot('a'), 'static');
    await vi.waitFor(() => expect(attached).toEqual(['a']));
    relay.leavePage();
    expect(cleaned).toEqual(['a']);
  });
});
