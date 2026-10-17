import { Fragment, h } from 'lithent';
import type { WDom } from 'lithent';
import { hastToNodes } from '../shared/richHast.js';
import { highlight } from './highlight.js';
import type { BlockData, HastNode, MdBody } from './types.js';

/** Rendered content: Lithent nodes and strings. */
export type Nodes = Array<WDom | string>;

/**
 * Renderers of the 10 guide blocks (DC-25 ③) and their sections. `Content` uses these
 * defaults (semantic HTML, server-highlighted code); pass `components` to style them.
 */
export interface BlockComponents {
  section(props: { id: string; heading: Nodes; text: string; children: Nodes }): unknown;
  paragraph(props: { children: Nodes }): unknown;
  bullets(props: { items: Nodes[] }): unknown;
  code(props: { lang?: string; label?: string; collapsible?: boolean; text: string }): unknown;
  checklist(props: { items: Nodes[] }): unknown;
  warning(props: { children: Nodes }): unknown;
  sequence(props: { steps: Nodes[] }): unknown;
  diagram(props: { label?: string; text: string }): unknown;
  callout(props: { kind: 'tip' | 'info' | 'note'; children: Nodes }): unknown;
  analogy(props: { children: Nodes }): unknown;
  debug(props: { items: Array<{ symptom: string; cause: string; fix: Nodes }> }): unknown;
}

const kids = (...nodes: unknown[]) =>
  nodes.flat(Infinity).filter(node => node !== null && node !== undefined && node !== false);
const el = (tag: string, props: Record<string, unknown>, ...children: unknown[]) =>
  h(tag, props as never, ...(kids(...children) as never[]));

export const defaultComponents: BlockComponents = {
  section: ({ id, heading, children }) => el('section', { id }, el('h2', {}, heading), children),
  paragraph: ({ children }) => el('p', {}, children),
  bullets: ({ items }) =>
    el(
      'ul',
      {},
      items.map(item => el('li', {}, item))
    ),
  code: ({ lang, label, text }) =>
    el(
      'figure',
      { class: 'code' },
      label ? el('figcaption', {}, label) : null,
      el('pre', {}, el('code', lang ? { class: `language-${lang}` } : {}, highlight(text, lang)))
    ),
  checklist: ({ items }) =>
    el(
      'ul',
      { class: 'checklist' },
      items.map(item => el('li', {}, item))
    ),
  warning: ({ children }) => el('aside', { class: 'warning', role: 'note' }, children),
  sequence: ({ steps }) =>
    el(
      'ol',
      {},
      steps.map(step => el('li', {}, step))
    ),
  diagram: ({ label, text }) =>
    el(
      'figure',
      { class: 'diagram' },
      el('pre', {}, text),
      label ? el('figcaption', {}, label) : null
    ),
  callout: ({ kind, children }) =>
    el('aside', { class: `callout callout-${kind}`, role: 'note' }, children),
  analogy: ({ children }) => el('aside', { class: 'analogy' }, children),
  debug: ({ items }) =>
    el(
      'dl',
      { class: 'debug' },
      items.map(item => [
        el('dt', {}, item.symptom),
        el('dd', {}, el('p', {}, item.cause), item.fix),
      ])
    ),
};

/** Repository content: root-relative links get BASE_PATH (DC-25 ③, rich allowlist). */
const nodes = (hast: HastNode[]): Nodes => hastToNodes(hast, { links: 'site' });

function block(data: BlockData, c: BlockComponents): unknown {
  switch (data.type) {
    case 'paragraph':
      return c.paragraph({ children: nodes(data.children) });
    case 'bullets':
      return c.bullets({ items: data.items.map(nodes) });
    case 'code':
      return c.code({
        lang: data.lang,
        label: data.label,
        collapsible: !!data.collapsible,
        text: data.text,
      });
    case 'checklist':
      return c.checklist({ items: data.items.map(nodes) });
    case 'sequence':
      return c.sequence({ steps: data.steps.map(nodes) });
    case 'diagram':
      return c.diagram({ label: data.label, text: data.text });
    case 'callout':
      return c.callout({ kind: data.kind, children: nodes(data.children) });
    case 'debug':
      return c.debug({
        items: data.items.map(item => ({
          symptom: item.symptom,
          cause: item.cause,
          fix: nodes(item.fix),
        })),
      });
    default:
      return c[data.type]({ children: nodes(data.children) });
  }
}

export function renderMd(body: MdBody, components: Partial<BlockComponents> = {}): WDom {
  const c = { ...defaultComponents, ...components };
  return Fragment(
    {},
    ...(body.sections.map(section =>
      c.section({
        id: section.id,
        heading: nodes(section.heading),
        text: section.text,
        children: kids(section.blocks.map(data => block(data, c))) as Nodes,
      })
    ) as never[])
  );
}

const list = (value: unknown): Nodes => kids(value) as Nodes;
const items = (value: unknown): Nodes[] =>
  (Array.isArray(value) ? value : [value]).map(item => list(item));

/**
 * The same renderers as MDX components (DC-25 ③): `<Warning>`, `<Callout kind="tip">`,
 * `<Analogy>`, `<Debug symptom cause>` take children; `<Checklist items>`, `<Sequence steps>`,
 * `<Bullets items>`, `<Diagram label text>` and `<Code lang label text>` take props. Fenced
 * code in `.mdx` becomes `<Code>` at build time. Lithent passes children as the second
 * argument.
 */
export function mdxComponents(components: Partial<BlockComponents> = {}) {
  const c = { ...defaultComponents, ...components };
  type Props = Record<string, unknown> & { children?: unknown };
  const body = (props: Props, children?: unknown) => list(children ?? props.children);
  return {
    Warning: (props: Props, children?: unknown) => c.warning({ children: body(props, children) }),
    Analogy: (props: Props, children?: unknown) => c.analogy({ children: body(props, children) }),
    Callout: (props: Props, children?: unknown) =>
      c.callout({
        kind: (props.kind as 'tip' | 'info' | 'note') ?? 'note',
        children: body(props, children),
      }),
    Debug: (props: Props, children?: unknown) =>
      c.debug({
        items: [
          {
            symptom: String(props.symptom ?? ''),
            cause: String(props.cause ?? ''),
            fix: body(props, children),
          },
        ],
      }),
    Checklist: (props: Props) => c.checklist({ items: items(props.items) }),
    Sequence: (props: Props) => c.sequence({ steps: items(props.steps) }),
    Bullets: (props: Props) => c.bullets({ items: items(props.items) }),
    Diagram: (props: Props) =>
      c.diagram({ label: props.label as string | undefined, text: String(props.text ?? '') }),
    Code: (props: Props) =>
      c.code({
        lang: props.lang as string | undefined,
        label: props.label as string | undefined,
        collapsible: !!props.collapsible,
        text: String(props.text ?? ''),
      }),
  };
}
