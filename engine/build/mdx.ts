import type { Code, Heading as MdHeading, Nodes, Parent, Root } from 'mdast';
import type { Heading } from '../content/types.js';
import { SurfaceBuildError } from './diagnostics.js';

/**
 * `.mdx` content (DC-25 ③): trusted repository files compiled with `@mdx-js/mdx` to JSX
 * (`jsxImportSource: 'lithent'`), so the call-site transform sees islands like any `.tsx`.
 * Fenced code becomes `<Code>` (server-highlighted like `.md`), headings get ids for the
 * table of contents, and YAML frontmatter is blanked (it is read by the content loader).
 */

export interface CompiledMdx {
  /** JSX module code (before the JSX transform). */
  code: string;
  headings: Heading[];
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const cache = new Map<string, Promise<CompiledMdx>>();

const textOf = (node: Nodes): string =>
  'value' in node && typeof node.value === 'string'
    ? node.value
    : 'children' in node
      ? (node.children as Nodes[]).map(textOf).join('')
      : '';

/** Heading ids keep letters of every script (`설치` stays readable), deduplicated per file. */
export function slugOf(text: string, used: Map<string, number>, index: number) {
  const base =
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '') || `section-${index + 1}`;
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

const literal = (value: string | boolean) => ({
  type: 'mdxJsxAttribute' as const,
  name: '',
  value: {
    type: 'mdxJsxAttributeValueExpression' as const,
    value: JSON.stringify(value),
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        comments: [],
        body: [
          {
            type: 'ExpressionStatement',
            expression: { type: 'Literal', value, raw: JSON.stringify(value) },
          },
        ],
      },
    },
  },
});

function codeElement(node: Code) {
  const attributes: Array<ReturnType<typeof literal>> = [];
  const add = (name: string, value: string | boolean) =>
    attributes.push({ ...literal(value), name });
  if (node.lang) add('lang', node.lang);
  for (const match of (node.meta ?? '').matchAll(/([A-Za-z-]+)(?:="([^"]*)")?/g))
    if (match[1] === 'label') add('label', match[2] ?? '');
    else if (match[1] === 'collapsible') add('collapsible', true);
  add('text', node.value);
  return {
    type: 'mdxJsxFlowElement',
    name: 'Code',
    attributes,
    children: [],
    position: node.position,
  };
}

function surfaceMdx(headings: Heading[]) {
  return () => (tree: Root) => {
    const used = new Map<string, number>();
    const walk = (parent: Parent) => {
      parent.children = parent.children.map(child => {
        if (child.type === 'code') return codeElement(child) as never;
        if (child.type === 'heading') {
          const heading = child as MdHeading;
          const text = textOf(heading).trim();
          const id = slugOf(text, used, headings.length);
          heading.data = {
            ...heading.data,
            hProperties: { ...(heading.data?.hProperties ?? {}), id },
          };
          headings.push({ depth: heading.depth, text, id });
        }
        if ('children' in child) walk(child as Parent);
        return child;
      });
    };
    walk(tree);
  };
}

async function compileNow(source: string, file: string): Promise<CompiledMdx> {
  const { compile } = await import('@mdx-js/mdx');
  // Keep line numbers: the frontmatter becomes empty lines.
  const value = source.replace(FRONTMATTER, match => match.replace(/[^\n]/g, ''));
  const headings: Heading[] = [];
  try {
    const output = await compile(
      { value, path: file },
      {
        jsx: true,
        jsxImportSource: 'lithent',
        development: false,
        remarkPlugins: [surfaceMdx(headings)],
      }
    );
    return { code: String(output), headings };
  } catch (error) {
    const message = error as { reason?: string; message: string; line?: number; column?: number };
    throw new SurfaceBuildError(`MDX: ${message.reason ?? message.message}`, {
      file,
      code: source,
      ...(message.line ? { line: message.line, column: message.column ?? 1 } : {}),
    });
  }
}

/** Compile once per source text (the analyzer, the loader and the transform all ask). */
export function compileMdx(source: string, file: string): Promise<CompiledMdx> {
  const key = `${file}\0${source}`;
  let compiled = cache.get(key);
  if (!compiled) {
    for (const old of cache.keys()) if (old.startsWith(`${file}\0`)) cache.delete(old);
    compiled = compileNow(source, file);
    cache.set(key, compiled);
    compiled.catch(() => cache.delete(key));
  }
  return compiled;
}
