import type { UiPatch } from '../shared/protocol.js';

// ── safeStateJSON ──

/**
 * Safely serialize state for embedding in HTML <script> tags.
 * Escapes characters that could break out of the script context.
 */
export function safeStateJSON(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// ── fillHState ──

/**
 * Fill <h-state name="..."> anchors in HTML with rendered template content.
 * When ui is provided, injects class and style attributes for FOUC prevention.
 *
 * renderTemplate: given a state name and its data, returns the inner HTML string.
 */
export function fillHState(
  html: string,
  states: Record<string, any>,
  renderTemplate: (name: string, data: any) => string,
  ui?: Record<string, UiPatch | null>
): string {
  // Match <h-state name="...">...</h-state> (including self-closing and empty)
  return html.replace(
    /<h-state\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/h-state>/g,
    (_match, name: string, attrs: string, _existingContent: string) => {
      const data = states[name];

      if (data === undefined) {
        // No state for this anchor — leave empty
        return `<h-state name="${name}"${attrs}></h-state>`;
      }

      const inner = renderTemplate(name, data);

      // Build UI attributes (class + style from CSS vars)
      let uiAttrs = '';
      const patch = ui?.[name];
      if (patch) {
        if (patch.classAdd?.length) {
          uiAttrs += ` class="${patch.classAdd.join(' ')}"`;
        }
        if (patch.cssVars && Object.keys(patch.cssVars).length > 0) {
          const style = Object.entries(patch.cssVars)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
          uiAttrs += ` style="${style}"`;
        }
      }

      return `<h-state name="${name}"${attrs}${uiAttrs}>${inner}</h-state>`;
    }
  );
}

/**
 * Build the __STATE__ script tag for initial state bootstrapping.
 */
export function buildStateScript(states: Record<string, any>): string {
  return `<script id="__STATE__" type="application/json">${safeStateJSON(states)}</script>`;
}

/**
 * Build the __UI__ script tag for initial UI state bootstrapping.
 * Only generated when ui has entries; otherwise returns empty string.
 */
export function buildUiScript(ui: Record<string, UiPatch | null>): string {
  if (Object.keys(ui).length === 0) return '';
  return `<script id="__UI__" type="application/json">${safeStateJSON(ui)}</script>`;
}

/**
 * Build the __BOOT__ script tag for auto-run transition after hydration.
 */
export function buildBootScript(boot: {
  transition: string;
  params: Record<string, unknown>;
}): string {
  return `<script id="__BOOT__" type="application/json">${safeStateJSON(boot)}</script>`;
}

/**
 * Build the __BASE_PATH__ script tag for client basePath bootstrap.
 * Embedded in SSR HTML; client reads it in main.ts before hydration.
 */
export function buildBasePathScript(basePath: string): string {
  return `<script id="__BASE_PATH__" type="application/json">${safeStateJSON(basePath)}</script>`;
}
