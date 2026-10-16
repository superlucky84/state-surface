import type { TagFunction } from 'lithent';
import type { Mount } from './lithentBridge.js';
import type { PluginHost } from './pluginHost.js';
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
  childrenHtml?: string;
  status: 'dormant' | 'loading' | 'active' | 'failed';
  generation: number;
  component?: TagFunction;
  mount?: Mount;
  /** Latest frame data received before the component became active. */
  pending?: { op: 'render' | 'update'; data: unknown };
  cancel?: () => void;
}

/**
 * Owns client components of the page: schedules activation (load/idle/visible/media), loads
 * Lithent and the component chunk on demand, and mounts slots and islands. It also provides
 * the StateSurface callbacks, so frames for a dormant slot activate it first; the latest data
 * is applied after hydrating the SSR snapshot.
 */
export class ComponentHost {
  private instances = new Map<string, Instance>();
  private modules = new Map<string, Promise<TagFunction>>();
  private bridge?: Promise<Bridge>;
  /** Set once the bridge chunk loaded; active instances can mount synchronously. */
  private bridgeModule?: Bridge;

  constructor(
    private options: {
      loaders: ComponentLoaders;
      states: Record<string, unknown>;
      plugins?: PluginHost;
      report?: Report;
      loadBridge?: () => Promise<Bridge>;
    }
  ) {}

  /** Register client slots and islands rendered by the server and schedule them. */
  scan(root: ParentNode = document) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('h-state[data-component]')))
      this.register(
        el.getAttribute('name')!,
        'slot',
        el,
        this.options.states[el.getAttribute('name')!]
      );
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('h-island[data-island]'))) {
      let props: unknown = {};
      try {
        props = JSON.parse(el.getAttribute('data-props') ?? '{}');
      } catch (error) {
        this.report(error, { island: el.getAttribute('data-component') });
        continue;
      }
      this.register(el.getAttribute('data-island')!, 'island', el, props);
    }
    for (const instance of this.instances.values())
      if (instance.status === 'dormant' && !instance.cancel)
        instance.cancel = schedule(instance.timing, () => this.activate(instance), {
          element: instance.el,
          media: instance.media,
        });
  }

  private register(key: string, kind: Instance['kind'], el: HTMLElement, snapshot: unknown) {
    const existing = this.instances.get(key);
    if (existing) return existing;
    const timing = (el.getAttribute('data-activation') as Timing | null) ?? 'load';
    const instance: Instance = {
      key,
      kind,
      el,
      componentId: el.getAttribute('data-component') ?? '',
      timing,
      media: el.getAttribute('data-media') ?? undefined,
      only: el.hasAttribute('data-only'),
      snapshot,
      status: 'dormant',
      generation: 0,
    };
    if (kind === 'island') instance.childrenHtml = takeChildrenHtml(el);
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

  private ensure(name: string, el: HTMLElement) {
    return this.instances.get(name) ?? this.register(name, 'slot', el, undefined);
  }

  /** StateSurface callbacks for client slots; static and server slots are not updatable. */
  callbacks() {
    return {
      isUpdatable: (_name: string, el: HTMLElement) => el.hasAttribute('data-component'),
      hydrateTemplate: (name: string, data: unknown, el: HTMLElement) => {
        const instance = this.ensure(name, el);
        if (instance.snapshot === undefined) instance.snapshot = data;
        return () => {};
      },
      renderTemplate: (name: string, data: unknown, el: HTMLElement): void => {
        const instance = this.ensure(name, el);
        if (instance.status === 'active' && this.bridgeModule) {
          if (instance.mount) return this.callbacks().updateTemplate(name, data, el);
          el.innerHTML = '';
          try {
            instance.mount = this.mount(this.bridgeModule, instance, data, false);
          } catch (error) {
            this.report(error, { component: instance.componentId, slot: name });
            renderMissing(instance, error);
            return;
          }
          this.options.plugins?.displayedSlot(name, el, 'client');
          return;
        }
        if (instance.status === 'failed') return renderMissing(instance, new Error('not loaded'));
        instance.pending = { op: 'render', data };
        this.activate(instance);
      },
      updateTemplate: (name: string, data: unknown, el: HTMLElement): void => {
        const instance = this.ensure(name, el);
        if (instance.status === 'active' && instance.mount) {
          instance.mount.update(data);
          // Lithent applies the update in a microtask; notify plugins afterwards.
          queueMicrotask(() => this.options.plugins?.updatedSlot(name));
          return;
        }
        if (instance.status === 'active') return this.callbacks().renderTemplate(name, data, el);
        if (instance.status === 'failed') return;
        instance.pending = { op: instance.pending?.op === 'render' ? 'render' : 'update', data };
        this.activate(instance);
      },
      unmountTemplate: (name: string, _el: HTMLElement) => {
        const instance = this.instances.get(name);
        this.options.plugins?.removedSlot(name);
        if (!instance) return;
        instance.mount?.cleanup();
        instance.mount = undefined;
        instance.pending = undefined;
        instance.snapshot = undefined;
        instance.generation++;
        if (instance.status === 'loading') instance.status = 'dormant';
      },
    };
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
