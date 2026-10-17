import { emitTrace } from './trace.js';
import { DEV } from './dev.js';
import { setBasePath } from '../shared/basePath.js';
import type { SurfaceBootstrap } from '../shared/protocol.js';
import type { ComponentHost, PersistTarget } from './componentHost.js';
import { PluginRelay } from './pluginRelay.js';
import type { ActionInvocation } from './actionEvents.js';
import { readBootstrap } from './bootstrap.js';
import { provideRuntime } from './runtimeAccess.js';
import type { StateSurface } from './stateSurface.js';

/** Same invocation path as the runtime delegation (kept here to stay in the loader chunk). */
function runAction(surface: StateSurface, invocation: ActionInvocation) {
  return surface.transition(invocation.action, invocation.params, {
    ...(invocation.pendingTargets ? { pendingTargets: invocation.pendingTargets } : {}),
    ...(invocation.viewTransition ? { viewTransition: true } : {}),
    ...(invocation.form ? { form: invocation.form } : {}),
  });
}

/** Where persisted DOM, client slots and instances continue on the next page (DC-19). */
export interface PersistPlan {
  /** Element pairs the router moves: current node → its placeholder in the next document. */
  elements: Array<{ id: string; current: Element; next: Element }>;
  /** Client slot names that persist (actions targeting only these keep running). */
  slots: Set<string>;
  /** Component instances: current key → key and metadata on the next page. */
  instances: Map<string, PersistTarget>;
}

/** The loader's page lifecycle as the router sees it (DC-18, runtime lifetime split). */
export interface PageController {
  readonly bootstrap: SurfaceBootstrap;
  /** A navigation starts: abort actions that cannot survive it (any non-persisted target). */
  navigationStart(): void;
  /** Before the DOM swap: dispose what does not persist. */
  leavePage(plan: PersistPlan): void;
  /** After the DOM swap: start the next page (plugins, components, actions, `<Boot>`). */
  enterPage(next: SurfaceBootstrap, plan: PersistPlan): void;
  /** Called when an action ends (the router empties its prefetch cache). */
  onActionEnd(listener: () => void): void;
}

/**
 * Engine entry (DESIGN 5.1). The server writes this script only when the page uses client
 * components, actions, `<Boot>`, deferred slots, plugins or the router. It schedules
 * component activation and plugins and loads the action runtime when the page needs it (or
 * when a component calls `useAction`); a `data-action` click or submit before the runtime
 * is ready is snapshotted at event time and run once it loaded (DC-04 ⑦). A chunk that
 * fails after its retry checks the deployment: a new build reloads the page on the next
 * interaction (DC-04 ③).
 *
 * Lifetimes (DC-18): the loader, listeners, plugin modules and the action runtime live for
 * the document; slots, instances, plugin entries and `<Boot>` live for a page. The router
 * chunk (pages with `<ClientRouter>`) drives `leavePage`/`enterPage` on client navigation.
 *
 * Size (DC-17): the loader keeps only what every engine page needs. The component host
 * (with the app's componentId → chunk map) loads on pages with client components and with
 * the action runtime; the plugin host at the earliest timing of the page's plugins.
 */
export function startLoader(root: Document = document) {
  let bootstrap = readBootstrap(root);
  setBasePath(bootstrap.basePath);
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const report = (error: unknown, detail: Record<string, unknown>) => {
    // Development always logs; it also keeps the flag's module in the loader chunk, so the
    // other engine chunks import it from there instead of from a chunk of its own.
    if (debug || DEV) console.error('[StateSurface]', detail, error);
    // Trace subscribers (onTrace) see unexpected errors with their context in production too.
    emitTrace({
      kind: 'error',
      detail: { ...detail, message: error instanceof Error ? error.message : String(error) },
    });
    (globalThis as { reportError?: (error: unknown) => void }).reportError?.(error);
  };

  let checked = false;
  const checkBuild = () => {
    if (checked || !bootstrap.buildId) return;
    checked = true;
    void globalThis
      .fetch(location.href, { method: 'HEAD', cache: 'no-store' })
      .then(response => {
        const build = response.headers.get('x-surface-build');
        if (!build || build === bootstrap.buildId) return;
        const reload = () => location.reload();
        for (const type of ['pointerdown', 'keydown'])
          root.addEventListener(type, reload, { capture: true, once: true });
      })
      .catch(() => {});
  };

  const pluginHost = new PluginRelay(() => import('./pluginEntry.js'), report);
  let host: ComponentHost | undefined;
  let hostLoading: Promise<ComponentHost> | undefined;
  const loadHost = () =>
    (hostLoading ??= import('./components.js').then(
      module => {
        host = module.createComponentHost({
          plugins: pluginHost,
          report,
          onChunkError: checkBuild,
        });
        // The page may have changed while the chunk loaded: scan the current one.
        host.scan(root, bootstrap.slots ?? []);
        return host;
      },
      error => {
        hostLoading = undefined;
        report(error, { kind: 'chunk', chunk: 'components' });
        checkBuild();
        throw error;
      }
    ));
  const actionEnd: Array<() => void> = [];

  let runtime: Promise<StateSurface> | undefined;
  let surface: StateSurface | undefined;
  const startRuntime = () =>
    (runtime ??= Promise.all([import('./runtime.js'), loadHost()]).then(
      ([module, host]) => {
        // The page may have changed while the chunk loaded: start with the current one.
        surface = module.startRuntime({
          bootstrap,
          host,
          plugins: pluginHost,
          debug,
          report,
          onAction: event => {
            if (event.phase === 'end') for (const listener of actionEnd) listener();
          },
        });
        root.removeEventListener('click', capture);
        root.removeEventListener('submit', capture);
        return surface;
      },
      error => {
        runtime = undefined;
        report(error, { kind: 'chunk', chunk: 'runtime' });
        checkBuild();
        throw error;
      }
    ));
  provideRuntime(startRuntime);
  // Until the runtime delegation runs, a click or submit on an action is snapshotted at event
  // time and run once the runtime loaded (DC-04 ⑦). The event reader is its own chunk
  // (shared with the runtime and modulepreloaded with it), so pages without actions do not
  // carry it; it is in place as soon as that preloaded chunk evaluates.
  let events: typeof import('./actionEvents.js') | undefined;
  // Bubble phase: a component handler that called preventDefault() keeps the event.
  const capture = (event: Event) => {
    if (surface || !events) return;
    const element = events.actionTarget(event);
    if (!element) return;
    event.preventDefault();
    const invocation: ActionInvocation | undefined = events.readAction(element, event);
    if (!invocation) return;
    void startRuntime().then(
      surface => runAction(surface, invocation),
      () => {}
    );
  };
  let capturing: Promise<void> | undefined;
  const startCapture = () => {
    if (capturing || surface) return;
    capturing = import('./actionEvents.js').then(
      module => {
        events = module;
        if (surface) return;
        root.addEventListener('click', capture);
        root.addEventListener('submit', capture);
      },
      () => {}
    );
  };

  /** Page lifetime: display static/server slots, activate components, start plugins. */
  const mountPage = (persisted: ReadonlySet<string> = new Set()) => {
    const slots = bootstrap.slots ?? [];
    for (const meta of slots) {
      if (meta.mode === 'client' || meta.id.includes('$') || meta.defer) continue;
      const el = root.querySelector<HTMLElement>(`h-state[name="${CSS.escape(meta.id)}"]`);
      if (el?.childNodes.length) pluginHost.displayedSlot(meta.id, el, meta.mode);
    }
    if (host) host.scan(root, slots);
    else if (slots.some(meta => meta.mode === 'client' && meta.component))
      void loadHost().catch(() => {});
    if (surface) {
      surface.mountPage(bootstrap, persisted, root);
      surface.startPage(bootstrap.boot);
    } else if (!runtime) {
      const actions = root.querySelector('[data-action], form[action*="/_surface/action/"]');
      if (actions) startCapture();
      if (actions || bootstrap.boot?.length || slots.some(meta => meta.defer) || debug)
        void startRuntime().catch(() => {});
    }
    // Without the router, Speculation Rules prefetch the opted-in links (DC-20 ③); browsers
    // without them get <link rel="prefetch"> for the eager strategies.
    if (!bootstrap.router && !HTMLScriptElement.supports?.('speculationrules'))
      for (const link of Array.from(
        root.querySelectorAll<HTMLAnchorElement>(
          'a[data-prefetch="viewport"][href], a[data-prefetch="load"][href]'
        )
      )) {
        const hint = root.createElement('link');
        hint.rel = 'prefetch';
        hint.href = link.href;
        root.head.append(hint);
      }
  };
  pluginHost.mountPage(bootstrap.plugins ?? [], root);
  mountPage();

  const controller: PageController = {
    get bootstrap() {
      return bootstrap;
    },
    navigationStart() {
      const persisted = (bootstrap.slots ?? []).flatMap(meta =>
        meta.persist && !meta.id.includes('$') ? [meta.id] : []
      );
      surface?.leavePage(new Set(persisted));
    },
    leavePage(plan) {
      surface?.leavePage(plan.slots);
      pluginHost.leavePage(plan.slots);
      host?.leavePage(plan.instances);
    },
    enterPage(next, plan) {
      bootstrap = next;
      setBasePath(next.basePath);
      pluginHost.mountPage(next.plugins ?? [], root);
      mountPage(plan.slots);
    },
    onActionEnd(listener) {
      actionEnd.push(listener);
    },
  };
  if (bootstrap.router)
    void import('./router.js').then(
      module => module.startRouter(controller, root),
      error => report(error, { kind: 'chunk', chunk: 'router' })
    );
  return {
    /** The component host once its chunk loaded (tests). */
    host: () => hostLoading,
    /** The early action capture once its chunk loaded (tests). */
    capture: () => capturing,
    plugins: pluginHost,
    runtime: () => runtime,
    controller,
  };
}
