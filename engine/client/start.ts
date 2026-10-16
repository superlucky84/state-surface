/// <reference path="./virtual.d.ts" />
import components from 'virtual:state-surface/islands';
import plugins from 'virtual:state-surface/plugins';
import { setBasePath } from '../shared/basePath.js';
import type { SurfaceBootstrap } from '../shared/protocol.js';
import { ComponentHost } from './componentHost.js';
import { PluginHost, type PluginDefinition } from './pluginHost.js';
import { actionTarget, readAction, type ActionInvocation } from './actionEvents.js';
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

/** `<script id="__SURFACE__">`, the single bootstrap JSON (DESIGN 6.2). */
export function readBootstrap(root: Document = document): SurfaceBootstrap {
  const text = root.getElementById('__SURFACE__')?.textContent;
  const value = text ? (JSON.parse(text) as SurfaceBootstrap) : undefined;
  return { buildId: '', pageId: '', basePath: '', ...value };
}

/**
 * Engine entry (DESIGN 5.1). The server writes this script only when the page uses client
 * components, actions, `<Boot>`, deferred slots or plugins. It schedules component
 * activation and plugins and loads the action runtime when the page needs it (or when a
 * component calls `useAction`); a `data-action` click or submit before the runtime is
 * ready is snapshotted at event time and run once it loaded (DC-04 ⑦). A chunk that fails
 * after its retry checks the deployment: a new build reloads the page on the next
 * interaction (DC-04 ③).
 */
export function startLoader(root: Document = document) {
  const bootstrap = readBootstrap(root);
  setBasePath(bootstrap.basePath);
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const report = (error: unknown, detail: Record<string, unknown>) => {
    if (debug) console.error('[StateSurface]', detail, error);
    (globalThis as { reportError?: (error: unknown) => void }).reportError?.(error);
  };
  const slots = bootstrap.slots ?? [];

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

  const pluginHost = new PluginHost(
    bootstrap.plugins ?? [],
    plugins as Record<string, (() => Promise<PluginDefinition>) | undefined>,
    report
  );
  const host = new ComponentHost({
    loaders: components,
    plugins: pluginHost,
    report,
    onChunkError: checkBuild,
  });
  // Static and server slots are displayed as soon as the document is.
  for (const meta of slots) {
    if (meta.mode === 'client' || meta.id.includes('$') || meta.defer) continue;
    const el = root.querySelector<HTMLElement>(`h-state[name="${CSS.escape(meta.id)}"]`);
    if (el?.childNodes.length) pluginHost.displayedSlot(meta.id, el, meta.mode);
  }

  let runtime: Promise<StateSurface> | undefined;
  let ready = false;
  const startRuntime = () =>
    (runtime ??= import('./runtime.js').then(
      module => {
        const surface = module.startRuntime({
          bootstrap,
          host,
          plugins: pluginHost,
          debug,
          report,
        });
        ready = true;
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
  // Bubble phase: a component handler that called preventDefault() keeps the event.
  const capture = (event: Event) => {
    if (ready) return;
    const element = actionTarget(event);
    if (!element) return;
    event.preventDefault();
    const invocation: ActionInvocation | undefined = readAction(element, event);
    if (!invocation) return;
    void startRuntime().then(
      surface => runAction(surface, invocation),
      () => {}
    );
  };
  root.addEventListener('click', capture);
  root.addEventListener('submit', capture);
  host.scan(root, slots);
  pluginHost.start(root);
  if (
    root.querySelector('[data-action], form[action*="/_surface/action/"]') ||
    bootstrap.boot?.length ||
    slots.some(meta => meta.defer) ||
    debug
  )
    void startRuntime().catch(() => {});
  return { host, plugins: pluginHost, runtime: () => runtime };
}
