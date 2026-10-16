import type { SurfaceBootstrap } from '../shared/protocol.js';

/**
 * Serialize JSON for an HTML `<script type="application/json">` body: `<`, `>`, `&`,
 * U+2028 and U+2029 are written as `\u` escapes so the text cannot close the element.
 */
export function safeStateJSON(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** The single bootstrap JSON (DESIGN 6.2): build, page, base path, slots, boot, plugins. */
export function buildSurfaceScript(bootstrap: SurfaceBootstrap): string {
  return `<script id="__SURFACE__" type="application/json">${safeStateJSON(bootstrap)}</script>`;
}
