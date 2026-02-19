import { StateSurface } from '../engine/client/stateSurface.js';
import { createLithentBridge } from '../engine/client/lithentBridge.js';
import { attachDevOverlay } from '../engine/client/devOverlay.js';
import { bindDeclarativeActions } from '../engine/client/actionDelegation.js';
import { setBasePath } from '../shared/basePath.js';
import './styles.css';
import './templates/auto.js';

// Bootstrap basePath from SSR-embedded script tag (must happen before hydration)
const basePathEl = document.getElementById('__BASE_PATH__');
const basePath = basePathEl?.textContent ? (JSON.parse(basePathEl.textContent) as string) : '';
setBasePath(basePath);

// Create StateSurface with Lithent bridge
const bridge = createLithentBridge({ fallbackTemplate: 'system:error' });
const surface = new StateSurface({
  ...bridge,
  basePath,
  trace: event => {
    console.log('[StateSurface]', event.kind, event.detail ?? '');
  },
});

// Discover anchors and bootstrap from SSR state
surface.discoverAnchors();
surface.bootstrap();

// Declarative actions (data-action / data-params / data-pending-targets)
bindDeclarativeActions(surface);

// Auto-run transition if boot config is present
const bootEl = document.getElementById('__BOOT__');
if (bootEl?.textContent) {
  const bootConfig = JSON.parse(bootEl.textContent) as {
    transition: string;
    params: Record<string, unknown>;
  };
  surface.transition(bootConfig.transition, bootConfig.params);
}

// Attach dev overlay (?debug=1)
attachDevOverlay(surface);

// Expose for console debugging
(window as any).__surface = surface;
