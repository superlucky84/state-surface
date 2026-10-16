import { Fragment, h } from 'lithent';
import type { WDom } from 'lithent';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toHast } from 'mdast-util-to-hast';
import type { Element, Nodes, Root } from 'hast';
import { RICH, safeUrl } from './shared/capability.js';

/**
 * `capability="rich"` renderer (DESIGN 8.1, DC-13 ②): Markdown → mdast → hast → Lithent
 * nodes through an allowlist of elements, attributes and URL schemes. Raw HTML in the
 * source is dropped, never parsed. No DOM is needed, so it runs on every adapter.
 */

const ELEMENTS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'del',
  'a',
  'img',
  'hr',
  'br',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'sup',
  'sub',
]);
const ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title']),
  ol: new Set(['start']),
  th: new Set(['align']),
  td: new Set(['align']),
  code: new Set(['className']),
};
const URLS = new Set(['href', 'src']);

function attributes(node: Element): Record<string, unknown> {
  const allowed = ATTRIBUTES[node.tagName];
  const result: Record<string, unknown> = {};
  if (!allowed) return result;
  for (const [key, value] of Object.entries(node.properties ?? {})) {
    if (!allowed.has(key) || value === undefined || value === null || value === false) continue;
    if (key === 'className') {
      // Only `language-*` hints for code blocks.
      const classes = (Array.isArray(value) ? value : [value]).filter(
        name => typeof name === 'string' && /^language-[A-Za-z0-9_+-]+$/.test(name)
      );
      if (classes.length) result.class = classes.join(' ');
      continue;
    }
    const text = Array.isArray(value) ? value.join(' ') : String(value);
    if (URLS.has(key) && !safeUrl(text)) continue;
    result[key] = text;
  }
  if (node.tagName === 'a' && result.href) result.rel = 'nofollow noopener noreferrer';
  return result;
}

function convert(node: Nodes): Array<WDom | string> {
  if (node.type === 'text') return [node.value];
  if (node.type === 'root') return node.children.flatMap(convert);
  if (node.type !== 'element') return []; // comments, doctype, raw
  const children = node.children.flatMap(convert);
  // Unknown elements keep their text content but lose the element.
  if (!ELEMENTS.has(node.tagName)) return children;
  return [h(node.tagName, attributes(node) as never, ...(children as never[]))];
}

export interface MarkdownProps {
  /** Markdown source. Raw HTML is not rendered. */
  source: string;
}

/** Render Markdown with the rich allowlist. Use inside a `capability="rich"` slot. */
export function Markdown({ source }: MarkdownProps): WDom {
  const tree = toHast(fromMarkdown(typeof source === 'string' ? source : ''), {
    allowDangerousHtml: false,
  }) as Root;
  const node = Fragment({}, ...(convert(tree) as never[])) as WDom & { [RICH]?: true };
  node[RICH] = true;
  return node;
}
