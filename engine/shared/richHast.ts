import { h } from 'lithent';
import type { WDom } from 'lithent';
import { safeUrl } from './capability.js';
import { prefixPath } from './basePath.js';

/**
 * hast → Lithent through an allowlist of elements, attributes and URL schemes (DESIGN 8.1,
 * DC-13 ②). Shared by `Markdown` (capability="rich") and content collections (DC-25 ③).
 * Raw HTML, comments and unknown elements never become elements.
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

/** Minimal hast shape (the `hast` types or the content module's JSON). */
export type HastLike =
  | { type: 'root'; children: HastLike[] }
  | { type: 'text'; value: string }
  | { type: 'element'; tagName: string; properties?: Record<string, unknown>; children: HastLike[] }
  | { type: string; [key: string]: unknown };

export interface HastOptions {
  /**
   * `untrusted` (default, Markdown from data): every link gets
   * `rel="nofollow noopener noreferrer"`. `site` (repository content): root-relative URLs get
   * BASE_PATH and only external links get `rel="noopener noreferrer"`.
   */
  links?: 'untrusted' | 'site';
}

const isRootRelative = (url: string) => url.startsWith('/') && !url.startsWith('//');

function attributes(
  node: { tagName: string; properties?: Record<string, unknown> },
  options: HastOptions
): Record<string, unknown> {
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
    let text = Array.isArray(value) ? value.join(' ') : String(value);
    if (URLS.has(key)) {
      if (!safeUrl(text)) continue;
      if (options.links === 'site' && isRootRelative(text)) text = prefixPath(text);
    }
    result[key] = text;
  }
  if (node.tagName === 'a' && typeof result.href === 'string')
    if (options.links !== 'site') result.rel = 'nofollow noopener noreferrer';
    else if (/^[a-z][a-z0-9+.-]*:/i.test(result.href) && !result.href.startsWith('mailto:'))
      result.rel = 'noopener noreferrer';
  return result;
}

export function hastToNodes(
  nodes: readonly unknown[],
  options: HastOptions = {}
): Array<WDom | string> {
  const convert = (input: unknown): Array<WDom | string> => {
    const node = input as HastLike;
    if (node.type === 'text') return [String((node as { value: string }).value)];
    if (node.type === 'root') return (node as { children: HastLike[] }).children.flatMap(convert);
    if (node.type !== 'element') return []; // comments, doctype, raw
    const element = node as {
      tagName: string;
      properties?: Record<string, unknown>;
      children: HastLike[];
    };
    const children = element.children.flatMap(convert);
    // Unknown elements keep their text content but lose the element.
    if (!ELEMENTS.has(element.tagName)) return children;
    return [h(element.tagName, attributes(element, options) as never, ...(children as never[]))];
  };
  return nodes.flatMap(convert);
}
