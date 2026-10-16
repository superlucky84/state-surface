import { StateSurface, type TraceEvent } from './stateSurface.js';
import { bindDeclarativeActions } from './actionDelegation.js';
import type { ComponentHost } from './componentHost.js';
import type { PluginHost } from './pluginHost.js';

/**
 * Action runtime chunk: frame streaming, declarative action delegation and `<Boot>`.
 * Loaded only on pages with `data-action`, `<Boot>` or debug mode; Lithent stays in the
 * bridge chunk that the component host loads.
 */
export function startRuntime(options: {
  host: ComponentHost;
  plugins: PluginHost;
  basePath: string;
  debug: boolean;
}): StateSurface {
  const trace = options.debug
    ? (event: TraceEvent) => console.log('[StateSurface]', event.kind, event.detail ?? '')
    : undefined;
  const surface = new StateSurface({
    ...options.host.callbacks(),
    basePath: options.basePath,
    trace,
    onAction: event => options.plugins.action(event),
  });
  surface.discoverAnchors();
  surface.bootstrap();
  bindDeclarativeActions(surface);

  // <Boot> entries run in document order. Without targets each run aborts the previous one.
  const element = document.getElementById('__BOOT__');
  const boot = element?.textContent
    ? (JSON.parse(element.textContent) as Array<{
        transition: string;
        params: Record<string, unknown>;
      }>)
    : [];
  if (boot.length > 1 && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
    console.warn('[StateSurface] several <Boot> transitions abort each other until targets exist');
  for (const entry of boot) surface.transition(entry.transition, entry.params);

  if (options.debug) {
    void import('./devOverlay.js').then(({ attachDevOverlay }) => attachDevOverlay(surface));
    (window as unknown as { __surface?: StateSurface }).__surface = surface;
  }
  return surface;
}
