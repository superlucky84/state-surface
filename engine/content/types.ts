import type { InferOutput, StandardSchema } from '../shared/schema.js';

/** hast as stored in the content module (no positions). */
export type HastNode =
  | { type: 'text'; value: string }
  | {
      type: 'element';
      tagName: string;
      properties: Record<string, unknown>;
      children: HastNode[];
    };

/** The 10 guide blocks (DC-25 ③) as data. Text-bearing fields are inline hast. */
export type BlockData =
  | { type: 'paragraph'; children: HastNode[] }
  | { type: 'bullets'; items: HastNode[][] }
  | { type: 'code'; lang?: string; label?: string; collapsible?: true; text: string }
  | { type: 'checklist'; items: HastNode[][] }
  | { type: 'warning'; children: HastNode[] }
  | { type: 'sequence'; steps: HastNode[][] }
  | { type: 'diagram'; label?: string; text: string }
  | { type: 'callout'; kind: 'tip' | 'info' | 'note'; children: HastNode[] }
  | { type: 'analogy'; children: HastNode[] }
  | { type: 'debug'; items: Array<{ symptom: string; cause: string; fix: HastNode[] }> };

export interface SectionData {
  id: string;
  /** Heading text without the `{#id}`. */
  text: string;
  heading: HastNode[];
  line: number;
  blocks: BlockData[];
}
export interface MdBody {
  sections: SectionData[];
}

/** A heading for a table of contents (`.md`: the `##` sections). */
export interface Heading {
  depth: number;
  text: string;
  id: string;
}

/** One entry as the build serializes it into `virtual:state-surface/content`. */
export interface RawEntry {
  kind: 'md' | 'mdx' | 'data';
  collection: string;
  id: string;
  lang?: string;
  /** Project-relative in the content module (absolute while building). */
  file: string;
  data: unknown;
  body?: MdBody;
  headings: Heading[];
  /** `.mdx`: the compiled module (`default` is the MDX content component). */
  module?: { default: (props: Record<string, unknown>) => unknown };
}

export interface CollectionConfig<
  Schema extends StandardSchema | undefined = StandardSchema | undefined,
> {
  /** Standard Schema for frontmatter (`.md`/`.mdx`) or the whole data file. */
  schema?: Schema;
  /** Entries live in `content/<name>/<locale>/`; `parity` makes structure gaps build errors. */
  i18n?: { locales: readonly string[]; parity?: boolean };
  /** Build-time loader instead of files (CMS adapters later): entries with data only. */
  loader?: () =>
    | Array<{ id: string; lang?: string; data: unknown }>
    | Promise<Array<{ id: string; lang?: string; data: unknown }>>;
}

/** The validated data type of a collection config. */
export type InferData<C> =
  C extends CollectionConfig<infer S>
    ? S extends StandardSchema
      ? InferOutput<S>
      : Record<string, unknown>
    : Record<string, unknown>;

/** What `virtual:state-surface/content` exports: collections with their entries. */
export type ContentModule = Record<string, { locales?: readonly string[]; entries: RawEntry[] }>;
