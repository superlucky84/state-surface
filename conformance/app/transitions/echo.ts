import { defineTransition } from 'state-surface/server';

// Server slot projection: the state is rendered to an `html` op on every runtime.
export default defineTransition(async (input, ctx) => ({
  states: {
    'fixture:html': {
      text: JSON.stringify({ input, kind: ctx.route.kind, env: ctx.env.RUNTIME ?? 'unknown' }),
    },
  },
}));
