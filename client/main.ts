import { StateSurface } from '../engine/client/stateSurface.js';
import { createLithentBridge } from '../engine/client/lithentBridge.js';
import { attachDevOverlay } from '../engine/client/devOverlay.js';
import { bindDeclarativeActions } from '../engine/client/actionDelegation.js';
import { setBasePath } from '../shared/basePath.js';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
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

// Auto-highlight code blocks after DOM updates (guide pages)
const highlightCode = () => {
  document.querySelectorAll('pre code[class*="language-"]:not(.prism-done)').forEach(el => {
    Prism.highlightElement(el);
    // Wrap each line in a span for CSS line numbers
    const html = el.innerHTML;
    const lines = html.split('\n');
    // Remove trailing empty line
    if (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
    const pad = String(lines.length).length;
    el.innerHTML = lines
      .map((line, i) => {
        const num = String(i + 1).padStart(pad);
        return `<span class="code-ln">${num}</span>${line}`;
      })
      .join('\n');
    el.classList.add('prism-done');
  });
};
new MutationObserver(highlightCode).observe(document.body, { childList: true, subtree: true });
highlightCode();

// Expose for console debugging
(window as any).__surface = surface;
