import type { Code, Heading as MdHeading, Nodes, Parent, Root } from 'mdast';
import type { Heading } from '../content/types.js';
import type { RawSourceMap } from 'source-map';
import { parseSync } from 'oxc-parser';
import { SurfaceBuildError, locate } from './diagnostics.js';

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
  /** Source map of `code` back to the `.mdx` file (ESM and text; JSX elements have no maps). */
  map?: RawSourceMap;
  /** JSX elements of the document in source order (1-based line and column). */
  elements: Array<{ line: number; column: number; endLine: number; endColumn: number }>;
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

type Elements = CompiledMdx['elements'];
const JSX_NODES = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement']);

function surfaceMdx(headings: Heading[], elements: Elements) {
  return () => (tree: Root) => {
    const used = new Map<string, number>();
    const walk = (parent: Parent) => {
      parent.children = parent.children.map(child => {
        const position = child.position;
        // Code fences become <Code> elements: they count like written JSX.
        if ((child.type === 'code' || JSX_NODES.has(child.type)) && position)
          elements.push({
            line: position.start.line,
            column: position.start.column,
            endLine: position.end.line,
            endColumn: position.end.column,
          });
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
  const [{ compile }, { SourceMapGenerator }] = await Promise.all([
    import('@mdx-js/mdx'),
    import('source-map'),
  ]);
  // Keep line numbers: the frontmatter becomes empty lines.
  const value = source.replace(FRONTMATTER, match => match.replace(/[^\n]/g, ''));
  const headings: Heading[] = [];
  const elements: Elements = [];
  try {
    const output = await compile(
      { value, path: file },
      {
        jsx: true,
        jsxImportSource: 'lithent',
        development: false,
        remarkPlugins: [surfaceMdx(headings, elements)],
        SourceMapGenerator,
      }
    );
    return {
      code: String(output),
      headings,
      elements,
      map: output.map as RawSourceMap | undefined,
    };
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

/** JSX elements written in the document: the ones `_createMdxContent` returns, in order. */
function contentElements(code: string) {
  const program = parseSync('mdx.jsx', code, { lang: 'jsx' }).program as any;
  const content = program.body.find(
    (node: any) => node.type === 'FunctionDeclaration' && node.id?.name === '_createMdxContent'
  );
  const found: Array<{ start: number; end: number }> = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === 'JSXElement') {
      const name = node.openingElement.name;
      // Markdown syntax renders as `_components.h1`; everything else was written as JSX.
      const generated = name.type === 'JSXMemberExpression' && name.object.name === '_components';
      if (!generated) found.push({ start: node.start, end: node.end });
    }
    for (const key of Object.keys(node)) if (key !== 'type') visit(node[key]);
  };
  visit(content?.body);
  return found;
}

const offsetAt = (source: string, line: number, column: number) => {
  let offset = 0;
  for (let current = 1; current < line; current++) offset = source.indexOf('\n', offset) + 1;
  return offset + column - 1;
};

/**
 * Diagnostics of the compiled JSX (islands, Slot rules) point into the `.mdx` source. The
 * MDX source map has no positions for JSX elements, so an error inside the document maps
 * to the written element at the same index (and to its attribute when the error names
 * one); errors in ESM use the source map.
 */
export async function inMdxSource(
  error: unknown,
  source: string,
  file: string,
  compiled: CompiledMdx
): Promise<unknown> {
  if (!(error instanceof SurfaceBuildError) || error.id !== file || !error.loc) return error;
  const relocate = (line: number, column: number) =>
    new SurfaceBuildError(error.reason, { file, code: source, line, column, hint: error.hint });
  const offset = offsetAt(compiled.code, error.loc.line, error.loc.column + 1);
  const written = contentElements(compiled.code);
  if (written.length === compiled.elements.length) {
    let index = -1;
    written.forEach((element, i) => {
      if (element.start <= offset && offset < element.end) index = i;
    });
    if (index >= 0) {
      const target = compiled.elements[index];
      const start = offsetAt(source, target.line, target.column);
      const end = offsetAt(source, target.endLine, target.endColumn);
      // `client:media=…` in the compiled element → the same attribute in the source.
      const token = /^[\w:.-]+/.exec(compiled.code.slice(offset))?.[0];
      const at =
        offset > written[index].start && token ? source.slice(start, end).indexOf(token) : -1;
      const position = locate(source, at > 0 ? start + at : start);
      return relocate(position.line, position.column + 1);
    }
  }
  if (!compiled.map) return new SurfaceBuildError(error.reason, { file, hint: error.hint });
  const { SourceMapConsumer } = await import('source-map');
  const original = await SourceMapConsumer.with(compiled.map, null, consumer =>
    consumer.originalPositionFor({ line: error.loc!.line, column: error.loc!.column })
  );
  return original.line === null
    ? new SurfaceBuildError(error.reason, { file, hint: error.hint })
    : relocate(original.line, (original.column ?? 0) + 1);
}
