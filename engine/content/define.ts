import type { StandardSchema } from '../shared/schema.js';
import type { CollectionConfig } from './types.js';

/**
 * A content collection (DC-25): files under `content/<name>/` (with `i18n`, under
 * `content/<name>/<locale>/`) validated against `schema`. Export them from
 * `content/config.ts` as `collections`.
 *
 * Kept free of the content module so `content/config.ts` loads before any content is built.
 */
export function defineCollection<const S extends StandardSchema | undefined = undefined>(
  config: CollectionConfig<S>
): CollectionConfig<S> {
  return config;
}
