import { defineTransition } from 'state-surface/server';

// Hand-written Standard Schema (DC-22): `name` is required, `tag` is a string or an array.
const input = {
  '~standard': {
    version: 1 as const,
    vendor: 'conformance',
    validate(value: unknown) {
      const fields = value as Record<string, unknown>;
      return typeof fields.name === 'string' && fields.name
        ? { value: { name: fields.name, tags: ([] as unknown[]).concat(fields.tag ?? []) } }
        : { issues: [{ message: 'Required', path: ['name'] }] };
    },
  },
};

// Typed transition: the same definition serves JSON, form bodies and the PRG endpoint.
export default defineTransition({
  input,
  flash: { input: ['name', 'upload'] },
  handler: async (fields: { name: string; tags: unknown[] }) => ({
    states: {
      'fixture:html': {
        text: JSON.stringify({
          name: fields.name,
          tags: fields.tags.map(tag => (typeof tag === 'string' ? tag : 'file')),
        }),
      },
    },
  }),
});
