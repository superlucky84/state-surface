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

/**
 * Build the __STATE__ script tag with the props of client-rendered slots.
 */
export function buildStateScript(states: Record<string, unknown>): string {
  return `<script id="__STATE__" type="application/json">${safeStateJSON(states)}</script>`;
}

/**
 * Build the __BOOT__ script tag: rendered `<Boot>` entries in document order.
 */
export function buildBootScript(
  boot: Array<{ transition: string; params: Record<string, unknown> }>
): string {
  return `<script id="__BOOT__" type="application/json">${safeStateJSON(boot)}</script>`;
}

/**
 * Build the __BASE_PATH__ script tag for client basePath bootstrap.
 * Embedded in SSR HTML; client reads it in main.ts before hydration.
 */
export function buildBasePathScript(basePath: string): string {
  return `<script id="__BASE_PATH__" type="application/json">${safeStateJSON(basePath)}</script>`;
}
