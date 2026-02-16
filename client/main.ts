import { StateSurface } from './runtime/stateSurface.js';
import { createLithentBridge } from './runtime/lithentBridge.js';
import { attachDevOverlay } from './runtime/devOverlay.js';
import { bindDeclarativeActions } from './runtime/actionDelegation.js';
import './styles.css';
import './templates/auto.js';

// Create StateSurface with Lithent bridge
const bridge = createLithentBridge({ fallbackTemplate: 'system:error' });
const surface = new StateSurface({
  ...bridge,
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
