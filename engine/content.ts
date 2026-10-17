/**
 * `state-surface/content` (DC-25, DESIGN 10.8): content collections from `content/` on the
 * server. The build parses and validates every file into the server bundle, so queries need
 * no file system (Workers included) and nothing reaches the browser bundle.
 */
import './serverOnly.js';
import content from 'virtual:state-surface/content';
import {
  createCollections,
  type CollectionEntry,
  type CollectionQuery,
} from './content/runtime.js';
import type { InferData } from './content/types.js';

export { defineCollection } from './content/define.js';
export { defaultComponents, mdxComponents } from './content/render.js';
export type { BlockComponents, Nodes } from './content/render.js';
export { highlight, highlightLines } from './content/highlight.js';
export type { CollectionEntry, CollectionQuery } from './content/runtime.js';
export type { CollectionConfig, Heading, InferData } from './content/types.js';

declare global {
  namespace StateSurface {
    /**
     * Collection name → its `defineCollection()` config. The build writes the entries into
     * `.state-surface/content.d.ts` from `content/config.ts`; without it any name is accepted.
     */
    interface Collections {}
  }
}

type Known = StateSurface.Collections;
/** Collection names from `content/config.ts` (any string before the first build). */
export type CollectionName = [keyof Known] extends [never] ? string : Extract<keyof Known, string>;
/** The schema output of a collection. */
export type DataOf<Name extends string> = Name extends keyof Known
  ? InferData<Known[Name]>
  : Record<string, unknown>;

const store = createCollections(content);

/** Entries of a collection in file order: one locale with `{ lang }`, else every locale. */
export function getCollection<Name extends CollectionName>(
  name: Name,
  query?: CollectionQuery<CollectionEntry<DataOf<Name>>>
): Promise<Array<CollectionEntry<DataOf<Name>>>> {
  return store.getCollection(name, query as CollectionQuery<CollectionEntry>) as never;
}

/** One entry by id (`{ lang }` is required for i18n collections), or undefined. */
export function getEntry<Name extends CollectionName>(
  name: Name,
  id: string,
  query?: { lang?: string }
): Promise<CollectionEntry<DataOf<Name>> | undefined> {
  return store.getEntry(name, id, query) as never;
}
