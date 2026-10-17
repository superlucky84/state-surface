import { h } from 'lithent';
import type { WDom } from 'lithent';
import Prism from './prismGlobal.js';
import 'prismjs/components/prism-markup.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-diff.js';

/**
 * Server-side code highlighting (DESIGN 5.1: server first). Prism tokens become
 * `<span class="token …">` nodes, so pages need no highlighter script. Lines are split for
 * line numbers; a token that spans lines is reopened on the next line.
 */

const ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
};

/** The Prism grammar name for a fence language, or undefined (plain text). */
export function grammarOf(lang?: string): string | undefined {
  if (!lang) return undefined;
  const name = ALIASES[lang] ?? lang;
  return Prism.languages[name] ? name : undefined;
}

type Segment = { text: string; classes: string };

function flatten(tokens: Array<string | Prism.Token>, classes: string[], out: Segment[]) {
  for (const token of tokens) {
    if (typeof token === 'string') {
      out.push({ text: token, classes: classes.join(' ') });
      continue;
    }
    const alias = token.alias ? ([] as string[]).concat(token.alias) : [];
    const next = [...classes, 'token', token.type, ...alias];
    const content = token.content;
    flatten(
      typeof content === 'string' ? [content] : Array.isArray(content) ? content : [content],
      [...new Set(next)],
      out
    );
  }
}

/** Highlighted lines of `code` (one node list per line, without the newline). */
export function highlightLines(code: string, lang?: string): Array<Array<WDom | string>> {
  const grammar = grammarOf(lang);
  const segments: Segment[] = [];
  if (grammar) flatten(Prism.tokenize(code, Prism.languages[grammar]), [], segments);
  else segments.push({ text: code, classes: '' });
  const lines: Array<Array<WDom | string>> = [[]];
  for (const segment of segments)
    segment.text.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (!part) return;
      lines[lines.length - 1].push(
        segment.classes ? h('span', { class: segment.classes }, part) : part
      );
    });
  if (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();
  return lines;
}

/** Highlighted `code` as nodes (lines joined with newlines). */
export function highlight(code: string, lang?: string): Array<WDom | string> {
  return highlightLines(code, lang).flatMap((line, index) => (index ? ['\n', ...line] : line));
}
