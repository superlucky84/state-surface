/**
 * Slot capability helpers (DESIGN 8.1, DC-13). The server enforces them while rendering
 * slot content: SSR, `html` ops and deferred responses.
 */

/** Marks the node produced by the rich (Markdown) renderer. */
export const RICH = Symbol.for('state-surface.rich');

/** Attributes holding URLs; values outside the allowed schemes are dropped. */
export const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'xlink:href',
  'poster',
  'cite',
  'background',
]);

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto']);
/** `<object data codebase>` load documents; elsewhere `data` is an ordinary attribute. */
const OBJECT_URL_ATTRIBUTES = new Set(['data', 'codebase']);
/** SVG `<animate>`/`<set>` values that can write a URL into `href` (`attributeName="href"`). */
const ANIMATION_VALUES = new Set(['to', 'from', 'by', 'values']);

/** http, https, mailto or a relative reference. Control and space characters are ignored. */
export function safeUrl(value: string): boolean {
  // Browsers drop ASCII tab/newline anywhere and leading C0/space before parsing the scheme.
  const normalized = value.replace(/[\u0000- \u007f]/g, '');
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(normalized);
  return !scheme || ALLOWED_SCHEMES.has(scheme[1].toLowerCase());
}

/**
 * strict/rich slot content (DESIGN 8.1): `true` drops the attribute, `'raw'` is raw HTML
 * (`srcdoc`, an error on the server). Event handler attributes in any letter case (Lithent
 * only skips lowercase `on…` names), URL attributes outside the allowed schemes and SVG
 * animations writing such a URL into `href`. `animated` is the element's `attributeName`.
 */
export function unsafeAttribute(
  tag: string,
  name: string,
  value: unknown,
  animated?: unknown
): boolean | 'raw' {
  const key = name.toLowerCase();
  if (key.startsWith('on')) return true;
  if (key === 'srcdoc') return 'raw';
  if (typeof value !== 'string') return false;
  if (URL_ATTRIBUTES.has(key) || (OBJECT_URL_ATTRIBUTES.has(key) && tag.toLowerCase() === 'object'))
    return !safeUrl(value);
  if (
    ANIMATION_VALUES.has(key) &&
    /^(animate|set)$/i.test(tag) &&
    typeof animated === 'string' &&
    /^(xlink:)?href$/i.test(animated.trim())
  )
    return value.split(';').some(part => !safeUrl(part.trim()));
  return false;
}

/**
 * Unsafe HTML never runs scripts (DC-13 ③). Script elements become inert templates; the
 * browser does not execute scripts inserted as HTML either, this covers the initial SSR.
 */
export function neutralizeScripts(html: string): string {
  return html
    .replace(/<script(?=[\s/>])/gi, '<template data-surface-script')
    .replace(/<\/script\s*>/gi, '</template>');
}

export function hasScript(html: string): boolean {
  return /<script[\s/>]/i.test(html);
}
