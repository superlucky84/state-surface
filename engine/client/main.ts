/// <reference path="./virtual.d.ts" />
import components from 'virtual:state-surface/islands';
import { StateSurface } from './stateSurface.js';
import { createLithentBridge } from './lithentBridge.js';
import { hydrateIslands } from './islands.js';
import { attachDevOverlay } from './devOverlay.js';
import { bindDeclarativeActions } from './actionDelegation.js';
import { setBasePath } from '../shared/basePath.js';
import type { StateSurfacePlugin, TraceEvent } from './stateSurface.js';

export interface CreateStateSurfaceOptions {
  plugins?: StateSurfacePlugin[];
  debug?: boolean;
  trace?: (event: TraceEvent) => void;
  transitionTimeout?: number;
}

type BootEntry = {
  transition: string;
  params: Record<string, unknown>;
};

function readBasePath(): string {
  const el = document.getElementById('__BASE_PATH__');
  if (!el?.textContent) return '';
  return JSON.parse(el.textContent) as string;
}

function readBootEntries(): BootEntry[] {
  const el = document.getElementById('__BOOT__');
  if (!el?.textContent) return [];
  return JSON.parse(el.textContent) as BootEntry[];
}

export function createStateSurface(options: CreateStateSurfaceOptions = {}): StateSurface {
  const basePath = readBasePath();
  setBasePath(basePath);

  const trace =
    options.trace ??
    (options.debug
      ? event => {
          console.log('[StateSurface]', event.kind, event.detail ?? '');
        }
      : undefined);

  const bridge = createLithentBridge({ components });
  const surface = new StateSurface({
    ...bridge,
    basePath,
    trace,
    plugins: options.plugins ?? [],
    transitionTimeout: options.transitionTimeout,
  });

  for (const plugin of options.plugins ?? []) {
    try {
      plugin.onInit?.(surface);
    } catch (err) {
      surface.trace?.({
        kind: 'error',
        detail: {
          plugin: plugin.name,
          hook: 'onInit',
          message: err instanceof Error ? err.message : err,
        },
      });
    }
  }

  surface.discoverAnchors();
  surface.bootstrap();
  hydrateIslands(components, (id, error) =>
    surface.trace?.({
      kind: 'error',
      detail: { island: id, message: error instanceof Error ? error.message : error },
    })
  );
  bindDeclarativeActions(surface);

  // <Boot> entries run in document order. Without targets each run aborts the previous one.
  const boot = readBootEntries();
  if (boot.length > 1 && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
    console.warn('[StateSurface] several <Boot> transitions abort each other until targets exist');
  for (const entry of boot) surface.transition(entry.transition, entry.params);

  attachDevOverlay(surface);

  if (options.debug) {
    (window as any).__surface = surface;
  }

  return surface;
}
