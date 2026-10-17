import { StateSurface, type TraceEvent } from './stateSurface.js';
import { DEV } from './dev.js';
import { bindDeclarativeActions } from './actionDelegation.js';
import { SlotDom } from './slotDom.js';
import type { ComponentHost } from './componentHost.js';
import type { PluginEvents } from './pluginHost.js';
import type { SurfaceBootstrap } from '../shared/protocol.js';

/**
 * Action runtime chunk: frame streaming and the HTML adapter, declarative action
 * delegation, `<Boot>` and deferred server slots. Loaded only on pages that need one of
 * them (or debug mode); Lithent stays in the bridge chunk that the component host loads.
 * It lives for the document; client navigation calls `mountPage`/`startPage` per page.
 */
export function startRuntime(options: {
  bootstrap: SurfaceBootstrap;
  host: ComponentHost;
  plugins: PluginEvents;
  debug: boolean;
  report: (error: unknown, detail: Record<string, unknown>) => void;
  /** Action start/end (the router empties its prefetch cache when an action ends). */
  onAction?: (event: { name: string; phase: 'start' | 'end'; error?: Error }) => void;
}): StateSurface {
  const trace = options.debug
    ? (event: TraceEvent) => console.log('[StateSurface]', event.kind, event.detail ?? '')
    : undefined;
  const dom = new SlotDom(options.host, options.plugins, { development: DEV });
  const surface = new StateSurface({
    bootstrap: options.bootstrap,
    slots: options.bootstrap.slots ?? [],
    actions: options.bootstrap.actions,
    host: options.host,
    dom,
    trace,
    report: options.report,
    development: DEV,
    onAction: event => {
      options.plugins.action(event);
      options.onAction?.(event);
    },
  });
  surface.discoverAnchors();
  // Document lifetime: one delegated listener pair for every page (DC-18).
  bindDeclarativeActions(surface);
  surface.startPage(options.bootstrap.boot);

  if (options.debug)
    void import('./devOverlay.js').then(({ attachDevOverlay }) => attachDevOverlay(surface));
  return surface;
}
