import { defineCollection } from 'state-surface/content';

// DC-25 fixture: one Markdown and one MDX document (with a client island).
export const collections = {
  docs: defineCollection({}),
};
