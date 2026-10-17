import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { directive } from 'micromark-extension-directive';
import { directiveFromMarkdown } from 'mdast-util-directive';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { toHast } from 'mdast-util-to-hast';
import { parseDocument, isNode, type Document } from 'yaml';
import type { Nodes as MdastNodes, Root, RootContent, PhrasingContent, ListItem } from 'mdast';
import type { ContainerDirective } from 'mdast-util-directive';
import { SurfaceBuildError } from './diagnostics.js';
import { listFiles } from './fsUtils.js';
import { validateSchema, type StandardSchema } from '../shared/schema.js';
import type {
  BlockData,
  CollectionConfig,
  HastNode,
  MdBody,
  RawEntry,
  SectionData,
} from '../content/types.js';

/**
 * Content collections at build time (DC-25, DESIGN 10.8): `content/<name>/[<lang>/]<id>.<ext>`
 * read, parsed and validated against `content/config.ts`. Markdown becomes serializable
 * block data (rendered on the server with the rich allowlist); `.mdx` files stay modules.
 */

const BLOCKS: Record<
  string,
  { attributes: Record<string, boolean>; values?: Record<string, string[]> }
> = {
  checklist: { attributes: {} },
  warning: { attributes: {} },
  sequence: { attributes: {} },
  diagram: { attributes: { label: false } },
  callout: { attributes: { kind: true }, values: { kind: ['tip', 'info', 'note'] } },
  analogy: { attributes: {} },
  debug: { attributes: { symptom: true, cause: true } },
};
const CODE_META = new Set(['label', 'collapsible']);
const SECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ContentProblem {
  message: string;
  file: string;
  line?: number;
  column?: number;
}

interface Located {
  file: string;
  source: string;
}

function fail(where: Located, message: string, point?: { line?: number; column?: number }): never {
  throw new SurfaceBuildError(message, {
    file: where.file,
    code: where.source,
    ...(point?.line && where.source ? { line: point.line, column: point.column ?? 1 } : {}),
  });
}
const at = (node: { position?: { start: { line: number; column: number } } }) =>
  node.position ? { line: node.position.start.line, column: node.position.start.column } : {};

/** hast JSON without positions (smaller, deterministic). */
function clean(node: unknown): HastNode[] {
  const value = node as {
    type: string;
    children?: unknown[];
    tagName?: string;
    properties?: Record<string, unknown>;
    value?: string;
  };
  if (value.type === 'root') return (value.children ?? []).flatMap(clean);
  if (value.type === 'text') return [{ type: 'text', value: value.value ?? '' }];
  if (value.type !== 'element') return [];
  return [
    {
      type: 'element',
      tagName: value.tagName!,
      properties: value.properties ?? {},
      children: (value.children ?? []).flatMap(clean),
    },
  ];
}
/** Block content: a root (blocks are separated by newline text, which HTML ignores). */
const hastOf = (nodes: RootContent[]) =>
  clean(toHast({ type: 'root', children: nodes } as Root, { allowDangerousHtml: false }));
/** Inline content through a paragraph: a root would put newlines between phrasing nodes. */
const inlineHast = (nodes: PhrasingContent[]) => {
  const [paragraph] = clean(
    toHast({ type: 'paragraph', children: nodes }, { allowDangerousHtml: false })
  );
  return paragraph?.type === 'element' ? paragraph.children : [];
};

function textOf(node: MdastNodes): string {
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('children' in node) return (node.children as MdastNodes[]).map(textOf).join('');
  return '';
}

/** Inline content may not hide raw HTML, directives or images. */
function checkInline(where: Located, node: MdastNodes) {
  if (node.type === 'html')
    fail(
      where,
      'Raw HTML is not allowed in content; write element names as inline code (`<h-state>`).',
      at(node)
    );
  if (node.type === 'textDirective' || node.type === 'leafDirective')
    fail(
      where,
      `":${node.name}" is read as a directive; write names like \`ns:${node.name}\` as inline code.`,
      at(node)
    );
  if (node.type === 'image')
    fail(where, 'Images in Markdown are not supported; use <Image> in a page.', at(node));
  if ('children' in node)
    for (const child of node.children as MdastNodes[]) checkInline(where, child);
}

/** A list item's content: inline nodes for a single paragraph, else block hast. */
function itemContent(where: Located, item: ListItem): HastNode[] {
  if (item.checked !== null && item.checked !== undefined)
    fail(where, 'Task list items ([ ]) are not supported; use :::checklist.', at(item));
  for (const child of item.children) checkInline(where, child);
  if (item.children.length === 1 && item.children[0].type === 'paragraph')
    return inlineHast(item.children[0].children);
  return hastOf(item.children);
}

function onlyList(where: Located, node: ContainerDirective, ordered: boolean) {
  const lists = node.children.filter(child => child.type === 'list');
  if (
    lists.length !== 1 ||
    node.children.length !== 1 ||
    (lists[0] as { ordered?: boolean }).ordered !== ordered
  )
    fail(
      where,
      `:::${node.name} must contain exactly one ${ordered ? 'ordered (1.)' : '"-"'} list.`,
      at(node)
    );
  return (lists[0] as { children: ListItem[] }).children.map(item => itemContent(where, item));
}

function prose(where: Located, node: ContainerDirective): HastNode[] {
  for (const child of node.children) {
    if (child.type !== 'paragraph' && child.type !== 'list')
      fail(
        where,
        `:::${node.name} may contain paragraphs and "-" lists only (found ${child.type}).`,
        at(child)
      );
    if (child.type === 'list' && child.ordered)
      fail(where, `Ordered lists belong in :::sequence.`, at(child));
    checkInline(where, child);
  }
  return hastOf(node.children);
}

function attributesOf(where: Located, node: ContainerDirective) {
  const spec = BLOCKS[node.name];
  const attrs = node.attributes ?? {};
  for (const name of Object.keys(attrs))
    if (!(name in spec.attributes))
      fail(
        where,
        `:::${node.name} has no attribute "${name}" (allowed: ${Object.keys(spec.attributes).join(', ') || 'none'}).`,
        at(node)
      );
  for (const [name, required] of Object.entries(spec.attributes)) {
    const value = attrs[name];
    if (required && (value === undefined || value === null || value === ''))
      fail(where, `:::${node.name} needs ${name}="…".`, at(node));
    const allowed = spec.values?.[name];
    if (allowed && value && !allowed.includes(value))
      fail(
        where,
        `:::${node.name} ${name}="${value}" must be one of ${allowed.join(', ')}.`,
        at(node)
      );
  }
  return attrs as Record<string, string | undefined>;
}

function codeMeta(where: Located, meta: string | null | undefined, node: MdastNodes) {
  const result: { label?: string; collapsible?: true } = {};
  if (!meta) return result;
  const pattern = /([A-Za-z-]+)(?:="([^"]*)")?/g;
  const rest = meta.replace(pattern, '').trim();
  if (rest) fail(where, `Code fence meta "${meta}" must be key="value" pairs or flags.`, at(node));
  for (const match of meta.matchAll(pattern)) {
    if (!CODE_META.has(match[1]))
      fail(
        where,
        `Code fence meta "${match[1]}" is unknown (allowed: label="…", collapsible).`,
        at(node)
      );
    if (match[1] === 'label') result.label = match[2] ?? '';
    else result.collapsible = true;
  }
  return result;
}

function block(where: Located, node: RootContent): BlockData {
  switch (node.type) {
    case 'paragraph':
      checkInline(where, node);
      return { type: 'paragraph', children: inlineHast(node.children) };
    case 'list':
      if (node.ordered) fail(where, 'Ordered lists belong in :::sequence.', at(node));
      return { type: 'bullets', items: node.children.map(item => itemContent(where, item)) };
    case 'code':
      return {
        type: 'code',
        ...(node.lang ? { lang: node.lang } : {}),
        ...codeMeta(where, node.meta, node),
        text: node.value,
      };
    case 'containerDirective': {
      if (!(node.name in BLOCKS))
        fail(
          where,
          `Unknown directive :::${node.name} (blocks: ${Object.keys(BLOCKS).join(', ')}).`,
          at(node)
        );
      const attrs = attributesOf(where, node);
      switch (node.name) {
        case 'checklist':
          return { type: 'checklist', items: onlyList(where, node, false) };
        case 'sequence':
          return { type: 'sequence', steps: onlyList(where, node, true) };
        case 'diagram': {
          const [code] = node.children;
          if (node.children.length !== 1 || code.type !== 'code')
            fail(where, ':::diagram must contain exactly one fenced code block.', at(node));
          return {
            type: 'diagram',
            ...(attrs.label ? { label: attrs.label } : {}),
            text: code.value,
          };
        }
        case 'callout':
          return {
            type: 'callout',
            kind: attrs.kind as 'tip' | 'info' | 'note',
            children: prose(where, node),
          };
        case 'debug':
          return {
            type: 'debug',
            items: [{ symptom: attrs.symptom!, cause: attrs.cause!, fix: prose(where, node) }],
          };
        default:
          return { type: node.name as 'warning' | 'analogy', children: prose(where, node) };
      }
    }
    case 'heading':
      return fail(
        where,
        `Only "##" section headings are allowed (found ${'#'.repeat(node.depth)}).`,
        at(node)
      );
    case 'html':
      return fail(where, 'Raw HTML is not allowed in content.', at(node));
    case 'leafDirective':
    case 'textDirective':
      return fail(
        where,
        `Unknown directive ::${node.name}; blocks are :::name containers.`,
        at(node)
      );
    default:
      return fail(
        where,
        `"${node.type}" is not a content block (see the 10 block types).`,
        at(node)
      );
  }
}

/** Frontmatter YAML, or a data file, with field positions for schema errors. */
function yamlData(where: Located, text: string, line: number) {
  const document = parseDocument(text, { prettyErrors: false });
  const [error] = document.errors;
  if (error) {
    // Without pretty errors only the offset is set.
    const before = text.slice(0, error.pos[0]).split('\n');
    fail(where, `Invalid YAML: ${error.message.split('\n')[0]}`, {
      line: line + before.length - 1,
      column: before[before.length - 1].length + 1,
    });
  }
  return { data: document.toJS() as unknown, document, line };
}

function fieldLine(
  document: Document | undefined,
  text: string,
  base: number,
  path: PropertyKey[]
) {
  const node = document?.getIn(path.map(String), true);
  if (!isNode(node) || !node.range) return undefined;
  return base + text.slice(0, node.range[0]).split('\n').length - 1;
}

async function validated(
  where: Located,
  schema: StandardSchema | undefined,
  data: unknown,
  positions: { document?: Document; text: string; line: number }
) {
  if (!schema) return data;
  const result = await validateSchema(schema, data);
  if (result.ok) return result.value;
  const [field, messages] = Object.entries(result.fieldErrors ?? {})[0] ?? ['', [result.message]];
  const line = field
    ? fieldLine(positions.document, positions.text, positions.line, field.split('.'))
    : undefined;
  fail(where, `${field ? `${field}: ` : ''}${messages[0] ?? result.message}`, {
    line: line ?? positions.line,
  });
}

export function parseMarkdown(where: Located) {
  const tree = fromMarkdown(where.source, {
    extensions: [directive(), frontmatter(['yaml'])],
    mdastExtensions: [directiveFromMarkdown(), frontmatterFromMarkdown(['yaml'])],
  });
  let front: { text: string; line: number } | undefined;
  const sections: SectionData[] = [];
  const ids = new Set<string>();
  for (const node of tree.children) {
    if (node.type === 'yaml') {
      front = { text: node.value, line: (node.position?.start.line ?? 1) + 1 };
      continue;
    }
    if (node.type === 'heading' && node.depth === 2) {
      checkInline(where, node);
      const last = node.children[node.children.length - 1];
      const match = last?.type === 'text' ? last.value.match(/\s*\{#([^}]*)\}\s*$/) : null;
      const children = [...node.children];
      if (match && last.type === 'text')
        children[children.length - 1] = { ...last, value: last.value.slice(0, match.index) };
      const text = textOf({ type: 'heading', depth: 2, children } as MdastNodes).trim();
      const id = match
        ? match[1]
        : text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
      if (!SECTION_ID.test(id))
        fail(where, `Section ID "${id}" must be kebab-case: "## ${text} {#my-section}".`, at(node));
      if (ids.has(id)) fail(where, `Section ID "${id}" is used twice.`, at(node));
      ids.add(id);
      sections.push({
        id,
        text,
        heading: inlineHast(children),
        line: node.position?.start.line ?? 1,
        blocks: [],
      });
      continue;
    }
    const current = sections[sections.length - 1];
    if (!current) fail(where, 'Content must start with a "## Heading {#id}" section.', at(node));
    const next = block(where, node);
    const previous = current.blocks[current.blocks.length - 1];
    // Consecutive :::debug directives are one block of items.
    if (next.type === 'debug' && previous?.type === 'debug') previous.items.push(...next.items);
    else current.blocks.push(next);
  }
  return { front, body: { sections } satisfies MdBody };
}

export interface ContentResult {
  collections: Record<string, RawEntry[]>;
  /** Files read (watched in dev). */
  files: string[];
  warnings: string[];
}

const EXTENSIONS = new Set(['.md', '.mdx', '.json', '.yaml', '.yml']);

/**
 * Shape of a data value for i18n parity: keys, value types and the length of lists of
 * records. Lists of plain values (tags, bullet strings) may differ in length per language.
 */
function shapeDiff(a: unknown, b: unknown, at = ''): string | undefined {
  const kind = (value: unknown) =>
    Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (kind(a) !== kind(b))
    return `${at || 'value'} is ${kind(a)} in one language and ${kind(b)} in the other`;
  if (Array.isArray(a) && Array.isArray(b)) {
    const plain = (list: unknown[]) => list.every(item => !item || typeof item !== 'object');
    if (plain(a) && plain(b)) return undefined;
    if (a.length !== b.length) return `${at || 'value'} has ${a.length} vs ${b.length} items`;
    for (let i = 0; i < a.length; i++) {
      const diff = shapeDiff(a[i], b[i], `${at}[${i}]`);
      if (diff) return diff;
    }
    return undefined;
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      const path = at ? `${at}.${key}` : key;
      if (!(key in a) || !(key in b)) return `${path} exists in only one language`;
      const diff = shapeDiff(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        path
      );
      if (diff) return diff;
    }
  }
  return undefined;
}

function blockTypes(body: MdBody) {
  return body.sections.map(section => ({
    id: section.id,
    line: section.line,
    types: section.blocks.map(b => b.type),
  }));
}

/** DC-25 ④: same documents and structure in every locale. */
function parity(name: string, entries: RawEntry[], locales: readonly string[], root: string) {
  const problems: ContentProblem[] = [];
  const byId = new Map<string, Map<string, RawEntry>>();
  for (const entry of entries) {
    if (!byId.has(entry.id)) byId.set(entry.id, new Map());
    byId.get(entry.id)!.set(entry.lang!, entry);
  }
  for (const [id, versions] of byId) {
    const [first, ...others] = locales;
    for (const locale of locales)
      if (!versions.has(locale)) {
        const base = [...versions.values()][0];
        problems.push({
          message: `"${id}" has no ${locale} version (content/${name}/${locale}/${id}${path.extname(base.file)}).`,
          file: base.file,
        });
      }
    const reference = versions.get(first);
    if (!reference) continue;
    for (const locale of others) {
      const other = versions.get(locale);
      if (!other) continue;
      if (reference.kind !== other.kind) {
        problems.push({
          message: `"${id}" is ${reference.kind} in ${first} but ${other.kind} in ${locale}.`,
          file: other.file,
        });
        continue;
      }
      if (reference.kind === 'md') {
        const a = blockTypes(reference.body as MdBody);
        const b = blockTypes(other.body as MdBody);
        const ids = (list: typeof a) => list.map(s => s.id).join(', ');
        if (ids(a) !== ids(b)) {
          problems.push({
            message: `Sections differ from ${first}: [${ids(a)}] vs [${ids(b)}].`,
            file: other.file,
          });
          continue;
        }
        a.forEach((section, i) => {
          if (section.types.join() !== b[i].types.join())
            problems.push({
              message: `Section "${section.id}" blocks differ from ${first}: [${section.types.join(', ')}] vs [${b[i].types.join(', ')}].`,
              file: other.file,
              line: b[i].line,
            });
        });
      } else if (reference.kind === 'mdx') {
        const depths = (entry: RawEntry) => entry.headings.map(heading => heading.depth).join();
        if (depths(reference) !== depths(other))
          problems.push({
            message: `Heading structure differs from ${first}: [${depths(reference)}] vs [${depths(other)}].`,
            file: other.file,
          });
      } else {
        const diff = shapeDiff(reference.data, other.data);
        if (diff)
          problems.push({
            message: `Data shape differs from ${first}: ${diff}.`,
            file: other.file,
          });
      }
    }
  }
  return problems.map(problem => ({ ...problem, file: path.relative(root, problem.file) }));
}

export interface LoadContentOptions {
  root: string;
  /** content/config.ts `collections`, imported by the caller (Vite module runner). */
  collections: Record<string, CollectionConfig>;
  /** Parity problems: build errors (default) or warnings (dev). */
  parity: 'error' | 'warn';
  /** Headings of an `.mdx` file (parsed by the caller with the MDX parser). */
  mdxHeadings(
    file: string,
    source: string
  ): Promise<Array<{ depth: number; text: string; id: string }>>;
}

export async function loadContent(options: LoadContentOptions): Promise<ContentResult> {
  const { root } = options;
  const result: ContentResult = { collections: {}, files: [], warnings: [] };
  for (const [name, config] of Object.entries(options.collections)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
      throw new SurfaceBuildError(`Collection name "${name}" must be kebab-case.`, {
        file: 'content/config.ts',
      });
    const dir = path.join(root, 'content', name);
    const entries: RawEntry[] = [];
    const sources = config.loader
      ? (await config.loader()).map(item => ({ ...item, file: path.join(dir, item.id) }))
      : undefined;
    const files = sources ? [] : (await listFiles(dir).catch(() => [])).sort();
    for (const file of files) {
      const relative = path.relative(dir, file).split(path.sep);
      if (relative.some(part => part.startsWith('_') || part.startsWith('.'))) continue;
      const ext = path.extname(file);
      if (!EXTENSIONS.has(ext))
        throw new SurfaceBuildError(`Unsupported content file (use .md, .mdx, .json or .yaml).`, {
          file: path.relative(root, file),
        });
      let lang: string | undefined;
      if (config.i18n) {
        lang = relative.shift();
        if (!lang || !config.i18n.locales.includes(lang) || !relative.length)
          throw new SurfaceBuildError(
            `Files of "${name}" live in content/${name}/<locale>/ (locales: ${config.i18n.locales.join(', ')}).`,
            { file: path.relative(root, file) }
          );
      }
      const id = relative.join('/').slice(0, -ext.length);
      const source = await readFile(file, 'utf8');
      result.files.push(file);
      const where = { file: path.relative(root, file), source };
      if (ext === '.md') {
        const { front, body } = parseMarkdown(where);
        const parsed = front ? yamlData(where, front.text, front.line) : undefined;
        const data = await validated(where, config.schema, parsed?.data ?? {}, {
          document: parsed?.document,
          text: front?.text ?? '',
          line: front?.line ?? 1,
        });
        entries.push({
          kind: 'md',
          collection: name,
          id,
          ...(lang ? { lang } : {}),
          file,
          data,
          body,
          headings: body.sections.map(section => ({
            depth: 2,
            text: section.text,
            id: section.id,
          })),
        });
      } else if (ext === '.mdx') {
        const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        const parsed = match ? yamlData(where, match[1], 2) : undefined;
        const data = await validated(where, config.schema, parsed?.data ?? {}, {
          document: parsed?.document,
          text: match?.[1] ?? '',
          line: 2,
        });
        entries.push({
          kind: 'mdx',
          collection: name,
          id,
          ...(lang ? { lang } : {}),
          file,
          data,
          headings: await options.mdxHeadings(file, source),
        });
      } else {
        let data: unknown;
        let document: Document | undefined;
        if (ext === '.json') {
          try {
            data = JSON.parse(source);
          } catch (error) {
            const position = Number(String((error as Error).message).match(/position (\d+)/)?.[1]);
            fail(
              where,
              `Invalid JSON: ${(error as Error).message}`,
              Number.isFinite(position)
                ? { line: source.slice(0, position).split('\n').length }
                : {}
            );
          }
        } else ({ data, document } = yamlData(where, source, 1));
        entries.push({
          kind: 'data',
          collection: name,
          id,
          ...(lang ? { lang } : {}),
          file,
          data: await validated(where, config.schema, data, { document, text: source, line: 1 }),
          headings: [],
        });
      }
    }
    for (const item of sources ?? [])
      entries.push({
        kind: 'data',
        collection: name,
        id: item.id,
        ...(item.lang ? { lang: item.lang } : {}),
        file: item.file,
        data: await validated({ file: `${name} loader`, source: '' }, config.schema, item.data, {
          text: '',
          line: 1,
        }),
        headings: [],
      });
    for (const entry of entries)
      try {
        JSON.stringify(entry.data);
      } catch {
        throw new SurfaceBuildError('Content data must be JSON (after the schema).', {
          file: path.relative(root, entry.file),
        });
      }
    if (config.i18n?.parity) {
      const problems = parity(name, entries, config.i18n.locales, root);
      if (problems.length && options.parity === 'error') {
        const [first] = problems;
        const source = await readFile(path.join(root, first.file), 'utf8').catch(() => undefined);
        throw new SurfaceBuildError(
          `${first.message}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`,
          { file: first.file, code: source, ...(first.line ? { line: first.line } : {}) }
        );
      }
      for (const problem of problems)
        result.warnings.push(
          `${problem.file}${problem.line ? `:${problem.line}` : ''}: ${problem.message}`
        );
    }
    result.collections[name] = entries;
  }
  return result;
}
