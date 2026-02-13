import { createHash } from 'node:crypto';

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
 * Also injects data-ssr-hash for hydration mismatch detection.
 *
 * renderTemplate: given a state name and its data, returns the inner HTML string.
 */
export function fillHState(
  html: string,
  states: Record<string, any>,
  renderTemplate: (name: string, data: any) => string
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
      const hash = ssrHash(inner);

      return `<h-state name="${name}"${attrs} data-ssr-hash="${hash}">${inner}</h-state>`;
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
 * Build the __BOOT__ script tag for auto-run transition after hydration.
 */
export function buildBootScript(boot: {
  transition: string;
  params: Record<string, unknown>;
}): string {
  return `<script id="__BOOT__" type="application/json">${safeStateJSON(boot)}</script>`;
}

// ── SSR Hash ──

/**
 * Canonicalize HTML and produce a sha256 hash for hydration mismatch detection.
 *
 * Canonicalization rules (from DESIGN.md):
 * - Collapse whitespace runs, trim edges
 * - Sort attributes by key
 * - Exclude HTML comments
 * - Exclude dynamic attributes (nonce, data-timestamp, etc.)
 */
export function ssrHash(html: string): string {
  const canonical = canonicalize(html);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

const DYNAMIC_ATTRS = new Set(['nonce', 'data-timestamp', 'data-nonce']);

function canonicalize(html: string): string {
  let result = html;

  // Remove HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, '');

  // Sort attributes on tags
  result = result.replace(/<(\w[\w-]*)((?:\s+[^>]*?)?)>/g, (_match, tag: string, attrStr: string) => {
    if (!attrStr.trim()) return `<${tag}>`;

    const attrs: Array<[string, string]> = [];
    const attrRegex = /\s+([\w-]+)(?:="([^"]*)")?/g;
    let m: RegExpExecArray | null;

    while ((m = attrRegex.exec(attrStr)) !== null) {
      const [, key, value] = m;
      // Exclude dynamic attributes
      if (!DYNAMIC_ATTRS.has(key)) {
        attrs.push([key, value !== undefined ? `${key}="${value}"` : key]);
      }
    }

    // Sort by attribute name
    attrs.sort((a, b) => a[0].localeCompare(b[0]));
    const sorted = attrs.map(([, full]) => full).join(' ');

    return `<${tag}${sorted ? ' ' + sorted : ''}>`;
  });

  // Collapse whitespace runs, trim
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}
