import { Fragment, h } from 'lithent';
import type { WDom } from 'lithent';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toHast } from 'mdast-util-to-hast';
import type { Root } from 'hast';
import { RICH } from './shared/capability.js';
import { hastToNodes } from './shared/richHast.js';

/**
 * `capability="rich"` renderer (DESIGN 8.1, DC-13 ②): Markdown → mdast → hast → Lithent
 * nodes through an allowlist of elements, attributes and URL schemes. Raw HTML in the
 * source is dropped, never parsed. No DOM is needed, so it runs on every adapter.
 */

export interface MarkdownProps {
  /** Markdown source. Raw HTML is not rendered. */
  source: string;
}

/** Render Markdown with the rich allowlist. Use inside a `capability="rich"` slot. */
export function Markdown({ source }: MarkdownProps): WDom {
  const tree = toHast(fromMarkdown(typeof source === 'string' ? source : ''), {
    allowDangerousHtml: false,
  }) as Root;
  const node = Fragment({}, ...(hastToNodes([tree]) as never[])) as WDom & { [RICH]?: true };
  node[RICH] = true;
  return node;
}
