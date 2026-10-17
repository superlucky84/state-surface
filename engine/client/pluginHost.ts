import { schedule } from './scheduler.js';
import { DEV } from './dev.js';
import { warning } from './trace.js';

export type SlotKind = 'client' | 'static' | 'server';

export interface PluginSlotInfo {
  slot: string;
  mode: SlotKind;
}

export interface ActionEvent {
  name: string;
  phase: 'start' | 'end';
  error?: Error;
}

/**
 * Slot and action events of the page. The loader's `PluginRelay` takes them before the
 * plugin host chunk loads and hands them on once it did; ComponentHost, SlotDom and the
 * action runtime only see this interface.
 */
export interface PluginEvents {
  /** Slot DOM is ready (SSR content of static/server slots, client activation or render). */
  displayedSlot(name: string, el: HTMLElement, mode: SlotKind): void;
  /** The same DOM was updated (client props update, morph). */
  updatedSlot(name: string): void;
  /** Called before the slot DOM is cleared. */
  removedSlot(name: string): void;
  action(event: ActionEvent): void;
}

/**
 * Client plugin (DC-12). Declared with `export const plugins = [plugin]` on pages or the
 * modules they import (layouts); only those pages load its chunk. `load` and `slots` must be
 * literals because the build reads them.
 */
export interface PluginDefinition {
  name: string;
  /** Target slot names; omitted means every slot of the page. */
  slots?: readonly string[];
  /** When the plugin chunk loads (default `idle`). */
  load?: 'load' | 'idle' | 'visible';
  /** Slot DOM is ready (SSR display, client activation). Return a cleanup. */
  attach?(el: HTMLElement, info: PluginSlotInfo): void | (() => void);
  /** The same DOM was updated (client props update). */
  update?(el: HTMLElement, info: PluginSlotInfo): void;
  /**
   * Page-level hook: once per page that declares the plugin (after its chunk loaded). The
   * signal aborts when a client navigation leaves the page.
   */
  onPage?(page: { signal: AbortSignal }): void;
  /** Action start/end on this page. */
  onAction?(event: ActionEvent): void;
}

export function definePlugin<T extends PluginDefinition>(definition: T): T {
  if (!definition?.name) throw new Error('[state-surface] definePlugin() needs a `name`.');
  return definition;
}

export interface PagePluginEntry {
  id: string;
  load: 'load' | 'idle' | 'visible';
  slots?: string[];
}

type Report = (error: unknown, detail: Record<string, unknown>) => void;

interface DisplayedSlot {
  el: HTMLElement;
  mode: SlotKind;
}

/**
 * Loads the page's plugins at their timing and calls their hooks for displayed slots.
 * A plugin that loads late attaches to every slot already displayed; slots that disappeared
 * before it loaded are never attached. Cleanups run before the slot DOM goes away.
 *
 * Plugin modules live for the document; entries, `onPage` and attachments live for a page
 * (DC-12/DC-18). On client navigation `leavePage` cleans up every slot that does not persist
 * and aborts the page signal; `mountPage` activates the next page's plugins (already loaded
 * modules at once) and persisted slots get `update`.
 */
export class PluginHost implements PluginEvents {
  /** Loaded plugin modules by id (document lifetime). */
  private modules = new Map<string, Promise<PluginDefinition | undefined>>();
  /** Plugins of the current page, in load order. */
  private loaded: Array<{ entry: PagePluginEntry; plugin: PluginDefinition }> = [];
  private displayed = new Map<string, DisplayedSlot>();
  /** Plugins attached per slot (a persisted slot keeps them across pages). */
  private attached = new Map<string, Set<PluginDefinition>>();
  private cleanups = new Map<string, Map<PluginDefinition, () => void>>();
  private page = new AbortController();
  private cancels: Array<() => void> = [];
  private generation = 0;

  private warnedOwnership = new Set<string>();

  constructor(
    private entries: PagePluginEntry[],
    private loaders: Record<string, (() => Promise<PluginDefinition>) | undefined>,
    private report: Report = () => {},
    private development = DEV
  ) {}

  start(root: ParentNode = document) {
    const generation = this.generation;
    for (const entry of this.entries) {
      const loader = Object.hasOwn(this.loaders, entry.id) ? this.loaders[entry.id] : undefined;
      if (!loader) {
        this.report(new Error(`Plugin "${entry.id}" not found`), { plugin: entry.id });
        continue;
      }
      if (this.modules.has(entry.id)) {
        void this.load(entry, loader, generation);
        continue;
      }
      const target = entry.slots?.length
        ? root.querySelector(entry.slots.map(name => `h-state[name="${name}"]`).join(','))
        : root.querySelector('h-state[name]');
      this.cancels.push(
        schedule(entry.load, () => void this.load(entry, loader, generation), {
          element: target ?? document.body,
        })
      );
    }
  }

  private async load(
    entry: PagePluginEntry,
    loader: () => Promise<PluginDefinition>,
    generation: number
  ) {
    let module = this.modules.get(entry.id);
    if (!module) {
      module = loader().then(undefined, error => {
        this.modules.delete(entry.id);
        this.report(error, { plugin: entry.id, hook: 'load' });
        return undefined;
      });
      this.modules.set(entry.id, module);
    }
    const plugin = await module;
    // The page changed while the chunk loaded: the next page activates it if it declares it.
    if (!plugin || generation !== this.generation) return;
    if (this.loaded.some(item => item.entry.id === entry.id)) return;
    this.loaded.push({ entry, plugin });
    this.call(plugin, 'onPage', () => plugin.onPage?.({ signal: this.page.signal }));
    for (const [name, slot] of this.displayed) this.attach(plugin, entry, name, slot);
  }

  /**
   * Client navigation: clean up slots that do not persist, abort the page signal and forget
   * the page's plugin entries. Persisted slots keep their attachments until `mountPage`.
   */
  leavePage(persisted: ReadonlySet<string> = new Set()) {
    this.generation++;
    for (const cancel of this.cancels.splice(0)) cancel();
    for (const name of [...this.displayed.keys()]) if (!persisted.has(name)) this.removedSlot(name);
    this.page.abort();
    this.page = new AbortController();
  }

  /** The next page's plugins: loaded modules activate at once, others at their timing. */
  mountPage(entries: PagePluginEntry[], root: ParentNode = document) {
    const previous = this.loaded;
    this.loaded = [];
    this.entries = entries;
    const kept = new Set(entries.map(entry => entry.id));
    // A persisted slot loses the attachments of plugins the next page does not declare.
    for (const [name, plugins] of this.attached)
      for (const plugin of plugins) {
        const item = previous.find(entry => entry.plugin === plugin);
        if (item && kept.has(item.entry.id)) continue;
        plugins.delete(plugin);
        const cleanup = this.cleanups.get(name)?.get(plugin);
        this.cleanups.get(name)?.delete(plugin);
        if (cleanup) this.call(plugin, 'cleanup', cleanup);
      }
    this.start(root);
  }

  private matches(entry: PagePluginEntry, name: string) {
    return !entry.slots?.length || entry.slots.includes(name);
  }

  private call(plugin: PluginDefinition, hook: string, run: () => void, slot?: string) {
    const watched =
      DEV && this.development && slot !== undefined
        ? watchOwnership(plugin, hook, slot, this.displayed.get(slot), this.warnedOwnership)
        : undefined;
    try {
      run();
    } catch (error) {
      this.report(error, { plugin: plugin.name, hook });
    } finally {
      watched?.();
    }
  }

  private attach(
    plugin: PluginDefinition,
    entry: PagePluginEntry,
    name: string,
    slot: DisplayedSlot
  ) {
    if (!this.matches(entry, name)) return;
    let plugins = this.attached.get(name);
    // A persisted slot is already attached: the plugin sees the same DOM again (DC-12/DC-19).
    if (plugins?.has(plugin)) {
      if (plugin.update)
        this.call(
          plugin,
          'update',
          () => plugin.update!(slot.el, { slot: name, mode: slot.mode }),
          name
        );
      return;
    }
    if (!plugin.attach) return;
    if (!plugins) this.attached.set(name, (plugins = new Set()));
    plugins.add(plugin);
    this.call(
      plugin,
      'attach',
      () => {
        const cleanup = plugin.attach!(slot.el, { slot: name, mode: slot.mode });
        if (typeof cleanup !== 'function') return;
        let slotCleanups = this.cleanups.get(name);
        if (!slotCleanups) this.cleanups.set(name, (slotCleanups = new Map()));
        slotCleanups.set(plugin, cleanup);
      },
      name
    );
  }

  /** Slot DOM is ready (SSR content of static/server slots, client activation or render). */
  displayedSlot(name: string, el: HTMLElement, mode: SlotKind) {
    if (this.displayed.has(name)) this.removedSlot(name);
    const slot = { el, mode };
    this.displayed.set(name, slot);
    for (const { entry, plugin } of this.loaded) this.attach(plugin, entry, name, slot);
  }

  updatedSlot(name: string) {
    const slot = this.displayed.get(name);
    if (!slot) return;
    for (const { entry, plugin } of this.loaded)
      if (this.matches(entry, name) && plugin.update)
        this.call(
          plugin,
          'update',
          () => plugin.update!(slot.el, { slot: name, mode: slot.mode }),
          name
        );
  }

  /** Called before the slot DOM is cleared. */
  removedSlot(name: string) {
    const slotCleanups = this.cleanups.get(name);
    this.cleanups.delete(name);
    this.attached.delete(name);
    this.displayed.delete(name);
    for (const [plugin, cleanup] of slotCleanups ?? []) this.call(plugin, 'cleanup', cleanup);
  }

  /** Displayed slots and plugins of the current page (dev overlay, leak tests). */
  get stats() {
    return { plugins: this.loaded.length, slots: this.displayed.size, modules: this.modules.size };
  }

  action(event: ActionEvent) {
    for (const { plugin } of this.loaded)
      if (plugin.onAction) this.call(plugin, 'onAction', () => plugin.onAction!(event));
  }
}

/**
 * Dev (DESIGN 3.1): a plugin enhances slot DOM but never changes what Lithent renders, the
 * inside of client slots and islands; such changes are lost on the next render or break
 * hydration. Records the mutations of one synchronous hook call; the returned function
 * checks them.
 */
function watchOwnership(
  plugin: PluginDefinition,
  hook: string,
  slot: string,
  displayed: DisplayedSlot | undefined,
  warned: Set<string>
) {
  if (!displayed || typeof MutationObserver === 'undefined') return undefined;
  const { el, mode } = displayed;
  const observer = new MutationObserver(() => {});
  observer.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
  return () => {
    const records = observer.takeRecords();
    observer.disconnect();
    const owned = records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!target || !el.contains(target)) return false;
      if (mode === 'client') return target !== el;
      const island = target.closest('h-island');
      return !!island && el.contains(island);
    });
    const key = `${plugin.name}\0${slot}`;
    if (!owned || warned.has(key)) return;
    warned.add(key);
    warning(
      `plugin "${plugin.name}" changed DOM inside ${mode === 'client' ? `client slot "${slot}"` : `an island of slot "${slot}"`} during ${hook}. ` +
        'Lithent owns that DOM: the change is lost on the next render. Change the component, or ' +
        'enhance the slot element outside its islands.',
      true,
      { plugin: plugin.name, slot, hook }
    );
  };
}
