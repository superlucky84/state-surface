import type { TagFunction } from 'lithent';
import type { Mount } from './lithentBridge.js';
import type { PluginEvents } from './pluginHost.js';
import type { IslandMeta, SlotMeta } from '../shared/protocol.js';
import { schedule, type Timing } from './scheduler.js';

/** componentId → lazy loader of the client component chunk (`virtual:state-surface/islands`). */
export type ComponentLoaders = Record<string, (() => Promise<TagFunction>) | undefined>;
type Report = (error: unknown, detail: Record<string, unknown>) => void;
type Bridge = typeof import('./lithentBridge.js');

/** Result of a props update for the request that carried it (DESIGN 7장 `chunk`). */
export type PropsStatus = 'applied' | 'deferred' | 'failed';

/** Interactions inside a dormant boundary that activate it right away (DC-04 ⑤). */
const INTERACTIONS = ['pointerdown', 'focusin', 'keydown'] as const;

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
  /** DC-05: prop names whose values identify the instance; a change remounts it. */
  resetKey?: string[];
  keyValue?: string;
  childrenHtml?: string;
  /** strict/rich slot content gets the browser DOM guard; page islands are app markup. */
  guard: boolean;
  status: 'dormant' | 'loading' | 'active' | 'failed';
  generation: number;
  component?: TagFunction;
  mount?: Mount;
  /** Latest data received before the component became active. */
  pending?: { op: 'render' | 'update'; data: unknown };
  cancel?: () => void;
  /** Persisted across a client navigation: the next page's metadata (DC-19). */
  carry?: SlotMeta | IslandMeta;
}

/** Where a persisted instance continues on the next page (DC-19). */
export interface PersistTarget {
  key: string;
  meta: SlotMeta | IslandMeta;
}

const signatureOf = (component: string, props: unknown) =>
  `${component}\u0000${JSON.stringify(props ?? {})}`;
const keyOf = (resetKey: readonly string[] | undefined, props: unknown) =>
  resetKey &&
  JSON.stringify(
    resetKey.map(name => (props as Record<string, unknown> | undefined)?.[name] ?? null)
  );
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Owns client components of the page: schedules activation (load/idle/visible/media, or at
 * once on the first pointerdown/focusin/keydown inside a dormant boundary), loads Lithent
 * and the component chunk on demand (one retry after 1s), and mounts slots and islands.
 * Metadata comes from `__SURFACE__.slots` and `html` op `islands`. A dormant slot keeps the
 * latest data without loading; on activation it hydrates the SSR snapshot and then applies
 * that data, or mounts fresh after a reset or resetKey change (DC-04, DC-05).
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
      plugins?: PluginEvents;
      report?: Report;
      loadBridge?: () => Promise<Bridge>;
      /** A chunk failed after its retry (the loader checks for a new deployment). */
      onChunkError?: (error: unknown) => void;
      /** Delay before the one retry of a failed chunk (default 1000ms). */
      retryDelay?: number;
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
    for (const instance of this.instances.values()) {
      if (instance.status !== 'dormant' || instance.cancel) continue;
      const activate = () => this.activate(instance);
      const cancel = schedule(instance.timing, activate, {
        element: instance.el,
        media: instance.media,
      });
      // The interaction itself is not replayed; hydration keeps what the user typed.
      for (const type of INTERACTIONS)
        instance.el.addEventListener(type, activate, { capture: true, passive: true });
      instance.cancel = () => {
        cancel();
        for (const type of INTERACTIONS)
          instance.el.removeEventListener(type, activate, { capture: true });
      };
    }
  }

  private register(
    key: string,
    kind: Instance['kind'],
    el: HTMLElement,
    meta: Omit<IslandMeta, 'props'> & { props?: Record<string, unknown> }
  ) {
    const existing = this.instances.get(key);
    if (existing) {
      if (existing.carry) this.carryOver(existing);
      return existing;
    }
    const instance: Instance = {
      key,
      kind,
      el,
      componentId: meta.component,
      timing: meta.activation ?? 'load',
      media: meta.media,
      only: meta.only === true,
      snapshot: meta.props,
      guard: !key.startsWith('$') && meta.capability !== 'unsafe',
      status: 'dormant',
      generation: 0,
      ...(meta.resetKey
        ? { resetKey: meta.resetKey, keyValue: keyOf(meta.resetKey, meta.props) }
        : {}),
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

  /** Load promises are shared; a rejected one is forgotten so the retry loads again. */
  private loadBridge() {
    if (this.bridge) return this.bridge;
    const bridge = (this.options.loadBridge ?? (() => import('./lithentBridge.js')))().then(
      module => (this.bridgeModule = module)
    );
    bridge.catch(() => {
      if (this.bridge === bridge) this.bridge = undefined;
    });
    return (this.bridge = bridge);
  }

  private loadComponent(componentId: string) {
    let module = this.modules.get(componentId);
    if (!module) {
      const loader = Object.hasOwn(this.options.loaders, componentId)
        ? this.options.loaders[componentId]
        : undefined;
      const loading = loader
        ? loader()
        : Promise.reject(new Error(`Component "${componentId}" not found`));
      loading.catch(() => {
        if (this.modules.get(componentId) === loading) this.modules.delete(componentId);
      });
      this.modules.set(componentId, (module = loading));
    }
    return module;
  }

  /** Start activation now (scheduled timing, interaction, or an explicit request). */
  activateNow(key: string) {
    const instance = this.instances.get(key);
    if (instance) this.activate(instance);
  }

  private activate(instance: Instance) {
    if (instance.status !== 'dormant') return;
    instance.cancel?.();
    instance.cancel = undefined;
    instance.status = 'loading';
    const generation = instance.generation;
    const load = (retry: boolean): Promise<[Bridge, TagFunction]> =>
      Promise.all([this.loadBridge(), this.loadComponent(instance.componentId)]).catch(error =>
        retry
          ? delay(this.options.retryDelay ?? 1000).then(() => {
              if (instance.generation !== generation) throw error;
              return load(false);
            })
          : Promise.reject(error)
      );
    load(true).then(
      ([bridge, component]) => {
        if (instance.generation !== generation) return;
        instance.status = 'active';
        instance.component = component;
        this.start(instance, bridge);
      },
      error => {
        if (instance.generation !== generation) return;
        instance.status = 'failed';
        this.report(error, { component: instance.componentId, slot: instance.key, kind: 'chunk' });
        this.options.onChunkError?.(error);
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
      guard: instance.guard,
    });
  }

  /**
   * `props` op (or merged props) for a client slot. An active instance updates in place
   * (local state kept) unless `reset` or a resetKey change asks for a new mount (DC-05). A
   * dormant one keeps the latest data until its activation (no forced load).
   */
  setProps(
    name: string,
    el: HTMLElement,
    data: unknown,
    meta: SlotMeta,
    options: { reset?: boolean } = {}
  ): PropsStatus {
    let instance = this.instances.get(name);
    if (!instance) {
      instance = this.register(name, 'slot', el, {
        ...meta,
        component: meta.component!,
        props: undefined,
      });
      this.scheduleAll();
    }
    const keyValue = keyOf(instance.resetKey, data);
    const fresh = options.reset === true || keyValue !== instance.keyValue;
    instance.keyValue = keyValue;
    if (instance.status === 'active') {
      if (instance.mount && !fresh) {
        instance.mount.update(data);
        // Lithent applies the update in a microtask; notify plugins afterwards.
        queueMicrotask(() => this.options.plugins?.updatedSlot(name));
        return 'applied';
      }
      if (instance.mount) {
        this.options.plugins?.removedSlot(name);
        this.cleanupMount(instance);
      }
      el.innerHTML = '';
      try {
        instance.mount = this.mount(this.bridgeModule!, instance, data, false);
      } catch (error) {
        this.report(error, { component: instance.componentId, slot: name });
        renderMissing(instance, error);
        return 'failed';
      }
      this.options.plugins?.displayedSlot(name, el, 'client');
      return 'applied';
    }
    if (instance.status === 'failed') {
      if (instance.snapshot === undefined) renderMissing(instance, new Error('not loaded'));
      return 'failed';
    }
    instance.pending = {
      op:
        !fresh && instance.snapshot !== undefined && instance.pending?.op !== 'render'
          ? 'update'
          : 'render',
      data,
    };
    return 'deferred';
  }

  private cleanupMount(instance: Instance) {
    try {
      instance.mount?.cleanup();
    } catch (error) {
      this.report(error, { component: instance.componentId, slot: instance.key });
    }
    instance.mount = undefined;
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
    this.cleanupMount(instance);
    instance.pending = undefined;
    instance.snapshot = undefined;
    instance.generation++;
    if (instance.status === 'loading') instance.status = 'dormant';
  }

  /**
   * Client navigation (DC-18/DC-19): dispose every instance except persisted ones, which move
   * to their key on the next page. Their DOM is moved by the router; `scan` of the next page
   * then applies its props (unless `persistProps`) with the usual resetKey rule.
   */
  leavePage(persisted: ReadonlyMap<string, PersistTarget> = new Map()) {
    const kept = new Map<string, Instance>();
    for (const [key, instance] of this.instances) {
      const target = persisted.get(key);
      if (!target) {
        this.reset(instance);
        instance.status = 'failed'; // never activates again
        continue;
      }
      instance.key = target.key;
      instance.carry = target.meta;
      if (instance.kind === 'island') instance.el.setAttribute('data-island', target.key);
      kept.set(target.key, instance);
    }
    this.instances = kept;
  }

  private carryOver(instance: Instance) {
    const meta = instance.carry!;
    instance.carry = undefined;
    if (meta.persistProps || meta.props === undefined) return;
    instance.resetKey = meta.resetKey;
    if (instance.kind === 'island') instance.signature = signatureOf(meta.component!, meta.props);
    this.setProps(instance.key, instance.el, meta.props, meta as SlotMeta);
  }

  /** Instance counts by status (dev overlay, leak tests). */
  get stats() {
    const stats = {
      instances: this.instances.size,
      active: 0,
      dormant: 0,
      modules: this.modules.size,
    };
    for (const instance of this.instances.values())
      if (instance.status === 'active') stats.active++;
      else if (instance.status === 'dormant') stats.dormant++;
    return stats;
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

  /**
   * Morph boundary (IC-06, DC-05): keep the instance under the new id when component and
   * props are unchanged, or when only props changed and the island's resetKey values are the
   * same (the instance then receives the new props). Otherwise the caller replaces it.
   */
  keepIsland(key: string, meta: IslandMeta): boolean {
    const instance = this.instances.get(key);
    if (!instance || instance.componentId !== meta.component) return false;
    const signature = signatureOf(meta.component, meta.props);
    if (instance.signature !== signature) {
      const sameKey =
        instance.resetKey !== undefined &&
        JSON.stringify(instance.resetKey) === JSON.stringify(meta.resetKey ?? null) &&
        instance.keyValue === keyOf(instance.resetKey, meta.props);
      if (!sameKey) return false;
      instance.signature = signature;
      if (instance.status === 'active' && instance.mount) instance.mount.update(meta.props);
      else if (instance.status !== 'failed')
        instance.pending = {
          op: instance.pending?.op === 'render' ? 'render' : 'update',
          data: meta.props,
        };
    }
    this.rekey(key, meta.id);
    return true;
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
