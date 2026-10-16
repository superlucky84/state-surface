import type { TagFunction } from 'lithent';
import type { Mount } from './lithentBridge.js';
import type { PluginHost } from './pluginHost.js';
import type { IslandMeta, SlotMeta } from '../shared/protocol.js';
import { schedule, type Timing } from './scheduler.js';

/** componentId → lazy loader of the client component chunk (`virtual:state-surface/islands`). */
export type ComponentLoaders = Record<string, (() => Promise<TagFunction>) | undefined>;
type Report = (error: unknown, detail: Record<string, unknown>) => void;
type Bridge = typeof import('./lithentBridge.js');

interface Instance {
  key: string;
  kind: 'slot' | 'island';
  el: HTMLElement;
  componentId: string;
  timing: Timing;
  media?: string;
  only: boolean;
  /** SSR props (slot state or island props); undefined for empty slots. */
  snapshot?: unknown;
  /** Island props as rendered by the server (IC-06 morph comparison). */
  signature?: string;
  childrenHtml?: string;
  status: 'dormant' | 'loading' | 'active' | 'failed';
  generation: number;
  component?: TagFunction;
  mount?: Mount;
  /** Latest data received before the component became active. */
  pending?: { op: 'render' | 'update'; data: unknown };
  cancel?: () => void;
}

const signatureOf = (component: string, props: unknown) =>
  `${component}\u0000${JSON.stringify(props ?? {})}`;

/**
 * Owns client components of the page: schedules activation (load/idle/visible/media), loads
 * Lithent and the component chunk on demand, and mounts slots and islands. Metadata comes
 * from `__SURFACE__.slots` and `html` op `islands`. Data for a dormant slot activates it
 * first; the latest data is applied after hydrating the SSR snapshot (DC-05).
 */
export class ComponentHost {
  private instances = new Map<string, Instance>();
  private modules = new Map<string, Promise<TagFunction>>();
  private bridge?: Promise<Bridge>;
  /** Set once the bridge chunk loaded; active instances mount synchronously. */
  private bridgeModule?: Bridge;

  constructor(
    private options: {
      loaders: ComponentLoaders;
      plugins?: PluginHost;
      report?: Report;
      loadBridge?: () => Promise<Bridge>;
    }
  ) {}

  /** Register the client slots and islands of the bootstrap and schedule them. */
  scan(root: ParentNode, slots: readonly SlotMeta[]) {
    for (const meta of slots) {
      if (meta.mode !== 'client' || !meta.component) continue;
      const island = meta.id.includes('$');
      const el = island
        ? root.querySelector<HTMLElement>(`h-island[data-island="${CSS.escape(meta.id)}"]`)
        : root.querySelector<HTMLElement>(`h-state[name="${CSS.escape(meta.id)}"]`);
      if (el)
        this.register(meta.id, island ? 'island' : 'slot', el, {
          ...meta,
          component: meta.component,
        });
    }
    this.scheduleAll();
  }

  /** Islands of new server HTML inside `container` (`html` op or deferred response). */
  adopt(container: ParentNode, islands: readonly IslandMeta[] = []) {
    for (const meta of islands) {
      if (this.instances.has(meta.id)) continue;
      const el = container.querySelector<HTMLElement>(
        `h-island[data-island="${CSS.escape(meta.id)}"]`
      );
      if (el) this.register(meta.id, 'island', el, meta);
    }
    this.scheduleAll();
  }

  private scheduleAll() {
    for (const instance of this.instances.values())
      if (instance.status === 'dormant' && !instance.cancel)
        instance.cancel = schedule(instance.timing, () => this.activate(instance), {
          element: instance.el,
          media: instance.media,
        });
  }

  private register(
    key: string,
    kind: Instance['kind'],
    el: HTMLElement,
    meta: Omit<IslandMeta, 'props'> & { props?: Record<string, unknown> }
  ) {
    const existing = this.instances.get(key);
    if (existing) return existing;
    const instance: Instance = {
      key,
      kind,
      el,
      componentId: meta.component,
      timing: meta.activation ?? 'load',
      media: meta.media,
      only: meta.only === true,
      snapshot: meta.props,
      status: 'dormant',
      generation: 0,
    };
    if (kind === 'island') {
      instance.childrenHtml = takeChildrenHtml(el);
      instance.signature = signatureOf(meta.component, meta.props);
    }
    this.instances.set(key, instance);
    return instance;
  }

  private report(error: unknown, detail: Record<string, unknown>) {
    this.options.report?.(error, detail);
  }

  private loadBridge() {
    return (this.bridge ??= (
      this.options.loadBridge ?? (() => import('./lithentBridge.js'))
    )().then(bridge => (this.bridgeModule = bridge)));
  }

  private loadComponent(componentId: string) {
    let module = this.modules.get(componentId);
    if (!module) {
      const loader = Object.hasOwn(this.options.loaders, componentId)
        ? this.options.loaders[componentId]
        : undefined;
      module = loader
        ? loader()
        : Promise.reject(new Error(`Component "${componentId}" not found`));
      this.modules.set(componentId, module);
    }
    return module;
  }

  private activate(instance: Instance) {
    if (instance.status !== 'dormant') return;
    instance.cancel?.();
    instance.status = 'loading';
    const generation = instance.generation;
    Promise.all([this.loadBridge(), this.loadComponent(instance.componentId)]).then(
      ([bridge, component]) => {
        if (instance.generation !== generation) return;
        instance.status = 'active';
        instance.component = component;
        this.start(instance, bridge);
      },
      error => {
        if (instance.generation !== generation) return;
        instance.status = 'failed';
        this.report(error, { component: instance.componentId, slot: instance.key });
        // SSR HTML stays; only a slot that had nothing to show gets the error fallback.
        if (instance.pending?.op === 'render' || instance.snapshot === undefined || instance.only)
          renderMissing(instance, error);
      }
    );
  }

  private start(instance: Instance, bridge: Bridge) {
    const { el, pending } = instance;
    instance.pending = undefined;
    const ssr = instance.snapshot !== undefined && !instance.only;
    try {
      if (pending?.op === 'update' && ssr) {
        instance.mount = this.mount(bridge, instance, instance.snapshot, true);
        instance.mount.update(pending.data);
      } else if (pending) {
        el.innerHTML = '';
        instance.mount = this.mount(bridge, instance, pending.data, false);
      } else if (instance.snapshot !== undefined) {
        if (instance.only) el.innerHTML = '';
        instance.mount = this.mount(bridge, instance, instance.snapshot, ssr);
      }
    } catch (error) {
      this.report(error, { component: instance.componentId, slot: instance.key });
      renderMissing(instance, error);
      return;
    }
    if (instance.mount && instance.kind === 'slot')
      this.options.plugins?.displayedSlot(instance.key, el, 'client');
  }

  private mount(bridge: Bridge, instance: Instance, data: unknown, hydrate: boolean) {
    return bridge.mountComponent(instance.component!, data, instance.el, {
      hydrate,
      childrenHtml: instance.childrenHtml,
    });
  }

  /** `props` op (or merged props) for a client slot. */
  setProps(name: string, el: HTMLElement, data: unknown, meta: SlotMeta) {
    const instance =
      this.instances.get(name) ??
      this.register(name, 'slot', el, { ...meta, component: meta.component!, props: undefined });
    if (instance.status === 'active') {
      if (instance.mount) {
        instance.mount.update(data);
        // Lithent applies the update in a microtask; notify plugins afterwards.
        queueMicrotask(() => this.options.plugins?.updatedSlot(name));
        return;
      }
      el.innerHTML = '';
      try {
        instance.mount = this.mount(this.bridgeModule!, instance, data, false);
      } catch (error) {
        this.report(error, { component: instance.componentId, slot: name });
        renderMissing(instance, error);
        return;
      }
      this.options.plugins?.displayedSlot(name, el, 'client');
      return;
    }
    if (instance.status === 'failed') {
      if (instance.snapshot === undefined) renderMissing(instance, new Error('not loaded'));
      return;
    }
    instance.pending = {
      op:
        instance.snapshot !== undefined && instance.pending?.op !== 'render' ? 'update' : 'render',
      data,
    };
    this.activate(instance);
    this.scheduleAll();
  }

  /** `remove` op for a client slot: cleanup, forget the snapshot, clear the host. */
  remove(name: string) {
    const instance = this.instances.get(name);
    this.options.plugins?.removedSlot(name);
    if (!instance) return;
    this.reset(instance);
  }

  private reset(instance: Instance) {
    instance.cancel?.();
    instance.cancel = undefined;
    try {
      instance.mount?.cleanup();
    } catch (error) {
      this.report(error, { component: instance.componentId, slot: instance.key });
    }
    instance.mount = undefined;
    instance.pending = undefined;
    instance.snapshot = undefined;
    instance.generation++;
    if (instance.status === 'loading') instance.status = 'dormant';
  }

  /** Dispose islands inside `container` (server HTML replaced or removed, DC-08). */
  disposeWithin(container: Node) {
    for (const [key, instance] of this.instances)
      if (instance.kind === 'island' && container.contains(instance.el)) this.dispose(key);
  }

  dispose(key: string) {
    const instance = this.instances.get(key);
    if (!instance) return;
    this.reset(instance);
    instance.status = 'failed'; // never activates again
    this.instances.delete(key);
  }

  /** IC-06: an island with the same component and props keeps its instance across morph. */
  sameIsland(key: string, meta: IslandMeta) {
    return this.instances.get(key)?.signature === signatureOf(meta.component, meta.props);
  }

  rekey(from: string, to: string) {
    if (from === to) return;
    const instance = this.instances.get(from);
    if (!instance) return;
    this.instances.delete(from);
    instance.key = to;
    instance.el.setAttribute('data-island', to);
    this.instances.set(to, instance);
  }

  has(key: string) {
    return this.instances.has(key);
  }
}

/** Island children transport (IC-03): the template wins, else the island's own wrapper. */
function takeChildrenHtml(host: HTMLElement): string | undefined {
  const template = Array.from(host.children).find(
    child => child.tagName === 'TEMPLATE' && child.hasAttribute('data-surface-children')
  );
  if (template) {
    template.remove();
    return template.innerHTML;
  }
  return Array.from(host.querySelectorAll('h-children')).find(
    wrapper => wrapper.closest('h-island') === host
  )?.innerHTML;
}

function renderMissing(instance: Instance, error: unknown) {
  if (instance.kind !== 'slot') return;
  const message = `Component for slot "${instance.key}" failed: ${error instanceof Error ? error.message : String(error)}`;
  const div = document.createElement('div');
  div.setAttribute('data-error', 'template-fallback');
  div.textContent = message;
  instance.el.replaceChildren(div);
}
