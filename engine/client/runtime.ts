import { StateSurface, type TraceEvent } from './stateSurface.js';
import { bindDeclarativeActions } from './actionDelegation.js';
import { SlotDom } from './slotDom.js';
import type { ComponentHost } from './componentHost.js';
import type { PluginHost } from './pluginHost.js';
import type { SurfaceBootstrap } from '../shared/protocol.js';

const DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

/**
 * Action runtime chunk: frame streaming and the HTML adapter, declarative action
 * delegation, `<Boot>` and deferred server slots. Loaded only on pages that need one of
 * them (or debug mode); Lithent stays in the bridge chunk that the component host loads.
 */
export function startRuntime(options: {
  bootstrap: SurfaceBootstrap;
  host: ComponentHost;
  plugins: PluginHost;
  debug: boolean;
  report: (error: unknown, detail: Record<string, unknown>) => void;
}): StateSurface {
  const trace = options.debug
    ? (event: TraceEvent) => console.log('[StateSurface]', event.kind, event.detail ?? '')
    : undefined;
  const slots = options.bootstrap.slots ?? [];
  const dom = new SlotDom(options.host, options.plugins, { development: DEV });
  if (slots.some(slot => slot.swap === 'morph')) void dom.preloadMorph();
  const surface = new StateSurface({
    bootstrap: options.bootstrap,
    slots,
    host: options.host,
    dom,
    trace,
    report: options.report,
    development: DEV,
    onAction: event => options.plugins.action(event),
  });
  surface.discoverAnchors();
  bindDeclarativeActions(surface);
  void surface.loadDeferred();

  // <Boot> entries run in document order. Without targets each run aborts the previous one.
  const boot = options.bootstrap.boot ?? [];
  if (boot.length > 1 && DEV)
    console.warn('[StateSurface] several <Boot> transitions abort each other until targets exist');
  for (const entry of boot) void surface.transition(entry.transition, entry.params);

  if (options.debug) {
    void import('./devOverlay.js').then(({ attachDevOverlay }) => attachDevOverlay(surface));
    (window as unknown as { __surface?: StateSurface }).__surface = surface;
  }
  return surface;
}
