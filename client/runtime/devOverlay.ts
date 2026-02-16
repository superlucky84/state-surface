import type { TraceEvent } from './stateSurface.js';
import type { StateSurface } from './stateSurface.js';

const OVERLAY_ID = 'state-surface-dev-overlay';

/**
 * Attach a dev overlay to a StateSurface instance.
 * Activated by `?debug=1` in the URL query string.
 *
 * Shows:
 *  - Current activeStates (live-updated)
 *  - Recent trace event log (last 50)
 *
 * Returns a detach function, or undefined if debug mode is not active.
 */
export function attachDevOverlay(surface: StateSurface): (() => void) | undefined {
  if (!isDebugMode()) return undefined;

  const overlay = createOverlayElement();
  document.body.appendChild(overlay);

  const statesPanel = overlay.querySelector<HTMLElement>('[data-panel="states"]')!;
  const logPanel = overlay.querySelector<HTMLElement>('[data-panel="log"]')!;
  const logEntries: string[] = [];
  const MAX_LOG = 50;

  // Wire trace hook — chain with existing trace if present
  const prevTrace = surface.trace;
  surface.trace = (event: TraceEvent) => {
    prevTrace?.(event);
    onTrace(event);
  };

  function onTrace(event: TraceEvent) {
    // Update states panel
    statesPanel.textContent = JSON.stringify(surface.activeStates, null, 2);

    // Append to log
    const ts = new Date().toISOString().slice(11, 23);
    const detail = event.detail ? ` ${JSON.stringify(event.detail)}` : '';
    logEntries.push(`[${ts}] ${event.kind}${detail}`);
    if (logEntries.length > MAX_LOG) logEntries.shift();
    logPanel.textContent = logEntries.join('\n');
    logPanel.scrollTop = logPanel.scrollHeight;
  }

  // Initial render
  statesPanel.textContent = JSON.stringify(surface.activeStates, null, 2);

  function detach() {
    surface.trace = prevTrace;
    overlay.remove();
  }

  // Toggle button
  overlay
    .querySelector<HTMLElement>('[data-overlay-action="toggle"]')!
    .addEventListener('click', () => {
      const body = overlay.querySelector<HTMLElement>('[data-section="body"]')!;
      body.style.display = body.style.display === 'none' ? '' : 'none';
    });

  // Close button
  overlay
    .querySelector<HTMLElement>('[data-overlay-action="close"]')!
    .addEventListener('click', detach);

  return detach;
}

function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debug') === '1';
}

function createOverlayElement(): HTMLElement {
  const el = document.createElement('div');
  el.id = OVERLAY_ID;
  el.style.cssText = [
    'position:fixed',
    'bottom:0',
    'right:0',
    'width:400px',
    'max-height:50vh',
    'background:#1a1a2e',
    'color:#e0e0e0',
    'font-family:monospace',
    'font-size:11px',
    'z-index:99999',
    'border-top-left-radius:8px',
    'box-shadow:0 0 12px rgba(0,0,0,0.5)',
    'overflow:hidden',
  ].join(';');

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#16213e;cursor:pointer;">
      <strong data-overlay-action="toggle" style="cursor:pointer;">StateSurface Debug</strong>
      <span data-overlay-action="close" style="cursor:pointer;padding:0 4px;">\u2715</span>
    </div>
    <div data-section="body">
      <div style="padding:6px 10px;border-bottom:1px solid #333;">
        <div style="margin-bottom:4px;color:#0f3460;font-weight:bold;color:#a0c4ff;">activeStates</div>
        <pre data-panel="states" style="margin:0;max-height:120px;overflow:auto;white-space:pre-wrap;word-break:break-all;"></pre>
      </div>
      <div style="padding:6px 10px;">
        <div style="margin-bottom:4px;font-weight:bold;color:#a0c4ff;">Trace Log</div>
        <pre data-panel="log" style="margin:0;max-height:160px;overflow:auto;white-space:pre-wrap;word-break:break-all;"></pre>
      </div>
    </div>
  `;

  return el;
}
