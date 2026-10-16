/// <reference path="./virtual.d.ts" />
import components from 'virtual:state-surface/islands';
import plugins from 'virtual:state-surface/plugins';
import { setBasePath } from '../shared/basePath.js';
import { ComponentHost } from './componentHost.js';
import { PluginHost, type PagePluginEntry, type PluginDefinition } from './pluginHost.js';
import { actionTarget, readAction, type ActionInvocation } from './actionEvents.js';
import type { StateSurface } from './stateSurface.js';

/**
 * Engine entry (DESIGN 5.1). The server writes this script only when the page uses client
 * components, actions, `<Boot>` or plugins. It schedules component activation and plugins
 * and loads the action runtime when the page needs it; a `data-action` click or submit
 * before the runtime is ready is captured, snapshotted and replayed once (DC-04 ⑦).
 */
export function startLoader(root: Document = document) {
  const json = <T>(id: string): T | undefined => {
    const text = root.getElementById(id)?.textContent;
    return text ? (JSON.parse(text) as T) : undefined;
  };
  const basePath = json<string>('__BASE_PATH__') ?? '';
  setBasePath(basePath);
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const report = (error: unknown, detail: Record<string, unknown>) => {
    if (debug) console.error('[StateSurface]', detail, error);
    (globalThis as { reportError?: (error: unknown) => void }).reportError?.(error);
  };

  const pluginHost = new PluginHost(
    json<PagePluginEntry[]>('__PLUGINS__') ?? [],
    plugins as Record<string, (() => Promise<PluginDefinition>) | undefined>,
    report
  );
  const host = new ComponentHost({
    loaders: components,
    states: json<Record<string, unknown>>('__STATE__') ?? {},
    plugins: pluginHost,
    report,
  });
  // Static and server slots are displayed as soon as the document is.
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('h-state[name]')))
    if (!el.hasAttribute('data-component') && el.childNodes.length)
      pluginHost.displayedSlot(el.getAttribute('name')!, el, 'static');
  host.scan(root);
  pluginHost.start(root);

  let runtime: Promise<StateSurface> | undefined;
  let ready = false;
  const startRuntime = () =>
    (runtime ??= import('./runtime.js').then(module => {
      const surface = module.startRuntime({ host, plugins: pluginHost, basePath, debug });
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
      surface.transition(
        invocation.action,
        invocation.params,
        invocation.pendingTargets ? { pendingTargets: invocation.pendingTargets } : {}
      )
    );
  };
  root.addEventListener('click', capture, true);
  root.addEventListener('submit', capture, true);
  if (root.querySelector('[data-action]') || root.getElementById('__BOOT__') || debug)
    void startRuntime();
  return { host, plugins: pluginHost, runtime: () => runtime };
}
