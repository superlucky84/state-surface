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
    actions: options.bootstrap.actions,
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

  // <Boot> entries run in document order through the same concurrency rules as actions:
  // one without targets aborts the others (DC-30).
  const boot = options.bootstrap.boot ?? [];
  const actions = options.bootstrap.actions ?? {};
  if (
    DEV &&
    boot.length > 1 &&
    boot.some(
      entry => !Object.hasOwn(actions, entry.transition) || !actions[entry.transition].targets
    )
  )
    console.warn(
      '[StateSurface] several <Boot> transitions run on this page and at least one declares no ' +
        'targets, so they abort each other. Declare targets to run them in parallel.'
    );
  for (const entry of boot) void surface.transition(entry.transition, entry.params);

  if (options.debug)
    void import('./devOverlay.js').then(({ attachDevOverlay }) => attachDevOverlay(surface));
  return surface;
}
