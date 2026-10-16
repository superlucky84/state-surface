import { schedule } from './scheduler.js';

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
  /** Page-level hook, called once when the plugin loads. */
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
 */
export class PluginHost {
  private loaded: Array<{ entry: PagePluginEntry; plugin: PluginDefinition }> = [];
  private displayed = new Map<string, DisplayedSlot>();
  private cleanups = new Map<string, Map<PluginDefinition, () => void>>();
  private page = new AbortController();

  constructor(
    private entries: PagePluginEntry[],
    private loaders: Record<string, (() => Promise<PluginDefinition>) | undefined>,
    private report: Report = () => {}
  ) {}

  start(root: ParentNode = document) {
    for (const entry of this.entries) {
      const loader = Object.hasOwn(this.loaders, entry.id) ? this.loaders[entry.id] : undefined;
      if (!loader) {
        this.report(new Error(`Plugin "${entry.id}" not found`), { plugin: entry.id });
        continue;
      }
      const target = entry.slots?.length
        ? root.querySelector(entry.slots.map(name => `h-state[name="${name}"]`).join(','))
        : root.querySelector('h-state[name]');
      schedule(entry.load, () => void this.load(entry, loader), {
        element: target ?? document.body,
      });
    }
  }

  private async load(entry: PagePluginEntry, loader: () => Promise<PluginDefinition>) {
    let plugin: PluginDefinition;
    try {
      plugin = await loader();
    } catch (error) {
      this.report(error, { plugin: entry.id, hook: 'load' });
      return;
    }
    this.loaded.push({ entry, plugin });
    this.call(plugin, 'onPage', () => plugin.onPage?.({ signal: this.page.signal }));
    for (const [name, slot] of this.displayed) this.attach(plugin, entry, name, slot);
  }

  private matches(entry: PagePluginEntry, name: string) {
    return !entry.slots?.length || entry.slots.includes(name);
  }

  private call(plugin: PluginDefinition, hook: string, run: () => void) {
    try {
      run();
    } catch (error) {
      this.report(error, { plugin: plugin.name, hook });
    }
  }

  private attach(
    plugin: PluginDefinition,
    entry: PagePluginEntry,
    name: string,
    slot: DisplayedSlot
  ) {
    if (!this.matches(entry, name) || !plugin.attach) return;
    this.call(plugin, 'attach', () => {
      const cleanup = plugin.attach!(slot.el, { slot: name, mode: slot.mode });
      if (typeof cleanup !== 'function') return;
      let slotCleanups = this.cleanups.get(name);
      if (!slotCleanups) this.cleanups.set(name, (slotCleanups = new Map()));
      slotCleanups.set(plugin, cleanup);
    });
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
        this.call(plugin, 'update', () => plugin.update!(slot.el, { slot: name, mode: slot.mode }));
  }

  /** Called before the slot DOM is cleared. */
  removedSlot(name: string) {
    const slotCleanups = this.cleanups.get(name);
    this.cleanups.delete(name);
    this.displayed.delete(name);
    for (const [plugin, cleanup] of slotCleanups ?? []) this.call(plugin, 'cleanup', cleanup);
  }

  action(event: ActionEvent) {
    for (const { plugin } of this.loaded)
      if (plugin.onAction) this.call(plugin, 'onAction', () => plugin.onAction!(event));
  }
}
