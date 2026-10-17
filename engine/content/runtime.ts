import type { WDom } from 'lithent';
import { mdxComponents, renderMd, type BlockComponents } from './render.js';
import type { ContentModule, Heading, RawEntry } from './types.js';

/** One content entry (DC-25). `data` is the schema output. */
export interface CollectionEntry<Data = Record<string, unknown>> {
  collection: string;
  /** Path below the collection (and locale) folder without the extension: `quickstart`. */
  id: string;
  /** The locale folder of i18n collections. */
  lang?: string;
  /** `md`/`mdx` documents have a body; `data` entries are `.json`/`.yaml` or loader items. */
  kind: 'md' | 'mdx' | 'data';
  /** Project-relative source file. */
  file: string;
  data: Data;
  /** Table of contents: the `##` sections of `.md`, every heading of `.mdx`. */
  headings: readonly Heading[];
  /**
   * The rendered body. `components` replaces block renderers (the 10 guide blocks); `.mdx`
   * files get the same renderers as `<Warning>`, `<Callout>`, … components.
   */
  Content(props?: { components?: Partial<BlockComponents> }): WDom;
}

export interface CollectionQuery<Entry> {
  /** Entries of one locale (i18n collections); omitted, every locale. */
  lang?: string;
  filter?: (entry: Entry) => boolean;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function entryOf(raw: RawEntry): CollectionEntry {
  const { module, body } = raw;
  const Content: CollectionEntry['Content'] = props => {
    if (raw.kind === 'md') return renderMd(body!, props?.components);
    if (raw.kind === 'mdx')
      return module!.default({ components: mdxComponents(props?.components) }) as WDom;
    throw new Error(`${raw.file} is a data entry and has no Content.`);
  };
  return Object.freeze({
    collection: raw.collection,
    id: raw.id,
    ...(raw.lang ? { lang: raw.lang } : {}),
    kind: raw.kind,
    file: raw.file,
    data: freeze(raw.data) as Record<string, unknown>,
    headings: freeze(raw.headings),
    Content,
  });
}

/**
 * The query API over the build's content module. Entries are created once and frozen: they
 * are shared by every request.
 */
export function createCollections(content: ContentModule) {
  const collections = new Map(
    Object.entries(content).map(([name, collection]) => [
      name,
      { locales: collection.locales, entries: collection.entries.map(entryOf) },
    ])
  );
  const collectionOf = (name: string) => {
    const collection = collections.get(name);
    if (!collection)
      throw new Error(
        `Unknown content collection "${name}" (content/config.ts defines ${
          [...collections.keys()].map(key => `"${key}"`).join(', ') || 'none'
        }).`
      );
    return collection;
  };
  const checkLang = (name: string, locales: readonly string[] | undefined, lang?: string) => {
    if (lang === undefined) return;
    if (!locales) throw new Error(`Collection "${name}" has no i18n locales; omit { lang }.`);
    if (!locales.includes(lang))
      throw new Error(`Collection "${name}" has no locale "${lang}" (${locales.join(', ')}).`);
  };
  return {
    async getCollection(name: string, query: CollectionQuery<CollectionEntry> = {}) {
      const { locales, entries } = collectionOf(name);
      checkLang(name, locales, query.lang);
      return entries.filter(
        entry =>
          (query.lang === undefined || entry.lang === query.lang) &&
          (!query.filter || query.filter(entry))
      );
    },
    async getEntry(name: string, id: string, query: { lang?: string } = {}) {
      const { locales, entries } = collectionOf(name);
      if (locales && query.lang === undefined)
        throw new Error(`Collection "${name}" is per locale: getEntry("${name}", id, { lang }).`);
      checkLang(name, locales, query.lang);
      return entries.find(entry => entry.id === id && entry.lang === query.lang);
    },
  };
}
