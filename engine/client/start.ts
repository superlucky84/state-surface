/// <reference path="./virtual.d.ts" />
import components from 'virtual:state-surface/islands';
import plugins from 'virtual:state-surface/plugins';
import { setBasePath } from '../shared/basePath.js';
import type { SurfaceBootstrap } from '../shared/protocol.js';
import { ComponentHost } from './componentHost.js';
import { PluginHost, type PluginDefinition } from './pluginHost.js';
import { actionTarget, readAction, type ActionInvocation } from './actionEvents.js';
import type { StateSurface } from './stateSurface.js';

/** `<script id="__SURFACE__">`, the single bootstrap JSON (DESIGN 6.2). */
export function readBootstrap(root: Document = document): SurfaceBootstrap {
  const text = root.getElementById('__SURFACE__')?.textContent;
  const value = text ? (JSON.parse(text) as SurfaceBootstrap) : undefined;
  return { buildId: '', pageId: '', basePath: '', ...value };
}

/**
 * Engine entry (DESIGN 5.1). The server writes this script only when the page uses client
 * components, actions, `<Boot>`, deferred slots or plugins. It schedules component
 * activation and plugins and loads the action runtime when the page needs it; a
 * `data-action` click or submit before the runtime is ready is captured, snapshotted and
 * replayed once (DC-04 ⑦).
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

  const pluginHost = new PluginHost(
    bootstrap.plugins ?? [],
    plugins as Record<string, (() => Promise<PluginDefinition>) | undefined>,
    report
  );
  const host = new ComponentHost({ loaders: components, plugins: pluginHost, report });
  // Static and server slots are displayed as soon as the document is.
  for (const meta of slots) {
    if (meta.mode === 'client' || meta.id.includes('$') || meta.defer) continue;
    const el = root.querySelector<HTMLElement>(`h-state[name="${CSS.escape(meta.id)}"]`);
    if (el?.childNodes.length) pluginHost.displayedSlot(meta.id, el, meta.mode);
  }
  host.scan(root, slots);
  pluginHost.start(root);

  let runtime: Promise<StateSurface> | undefined;
  let ready = false;
  const startRuntime = () =>
    (runtime ??= import('./runtime.js').then(module => {
      const surface = module.startRuntime({ bootstrap, host, plugins: pluginHost, debug, report });
      ready = true;
      root.removeEventListener('click', capture, true);
      root.removeEventListener('submit', capture, true);
      return surface;
    }));
  const capture = (event: Event) => {
    if (ready) return;
    const element = actionTarget(event);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const invocation: ActionInvocation | undefined = readAction(element, event);
    if (!invocation) return;
    void startRuntime().then(surface =>
      surface.transition(invocation.action, invocation.params, {
        ...(invocation.pendingTargets ? { pendingTargets: invocation.pendingTargets } : {}),
        ...(invocation.viewTransition ? { viewTransition: true } : {}),
      })
    );
  };
  root.addEventListener('click', capture, true);
  root.addEventListener('submit', capture, true);
  if (
    root.querySelector('[data-action]') ||
    bootstrap.boot?.length ||
    slots.some(meta => meta.defer) ||
    debug
  )
    void startRuntime();
  return { host, plugins: pluginHost, runtime: () => runtime };
}
