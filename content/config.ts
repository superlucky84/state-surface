import { defineCollection } from 'state-surface/content';
import { integer, object, optional, text } from '../shared/schema.js';
import { LOCALES } from '../shared/locales.js';

/**
 * Content collections (DC-25): the guides are Markdown, the page UI texts YAML (one file per
 * page, typed in shared/pages.ts). Both are ko/en with structural parity.
 */
export const collections = {
  guides: defineCollection({
    schema: object({
      title: text({ min: 1 }),
      order: integer({ min: 1 }),
      demoHref: optional(text()),
      demoLabel: optional(text()),
    }),
    i18n: { locales: LOCALES, parity: true },
  }),
  pages: defineCollection({
    i18n: { locales: LOCALES, parity: true },
  }),
};
