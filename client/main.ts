import { StateSurface } from './runtime/stateSurface.js';
import { createLithentBridge } from './runtime/lithentBridge.js';
import { attachDevOverlay } from './runtime/devOverlay.js';
import { registerDemoTemplates } from '../demo/templates.js';

// Register demo templates (same registry as server SSR)
registerDemoTemplates();

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

// Attach dev overlay (?debug=1)
attachDevOverlay(surface);

// Wire demo control buttons
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action!;
    const params = btn.dataset.params ? JSON.parse(btn.dataset.params) : {};
    surface.transition(action, params);
  });
});

// Expose for console debugging
(window as any).__surface = surface;
