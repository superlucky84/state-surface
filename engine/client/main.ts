import { StateSurface } from './stateSurface.js';
import { createLithentBridge } from './lithentBridge.js';
import { attachDevOverlay } from './devOverlay.js';
import { bindDeclarativeActions } from './actionDelegation.js';
import { setBasePath } from '../shared/basePath.js';
import type { StateSurfacePlugin, TraceEvent } from './stateSurface.js';
import './templates/auto.js';

export interface CreateStateSurfaceOptions {
  fallbackTemplate?: string;
  plugins?: StateSurfacePlugin[];
  debug?: boolean;
  trace?: (event: TraceEvent) => void;
}

type BootConfig = {
  transition: string;
  params: Record<string, unknown>;
};

function readBasePath(): string {
  const el = document.getElementById('__BASE_PATH__');
  if (!el?.textContent) return '';
  return JSON.parse(el.textContent) as string;
}

function readBootConfig(): BootConfig | null {
  const el = document.getElementById('__BOOT__');
  if (!el?.textContent) return null;
  return JSON.parse(el.textContent) as BootConfig;
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

  const bridge = createLithentBridge({
    fallbackTemplate: options.fallbackTemplate ?? 'system:error',
  });
  const surface = new StateSurface({
    ...bridge,
    basePath,
    trace,
    plugins: options.plugins ?? [],
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
  bindDeclarativeActions(surface);

  const bootConfig = readBootConfig();
  if (bootConfig) {
    surface.transition(bootConfig.transition, bootConfig.params);
  }

  attachDevOverlay(surface);

  if (options.debug) {
    (window as any).__surface = surface;
  }

  return surface;
}
