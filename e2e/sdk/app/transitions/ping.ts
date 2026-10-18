import { defineTransition } from 'state-surface/server';

// Server slot update; `crash` renders content the probe plugin fails on (engine-reported).
export default defineTransition({
  targets: ['box'],
  async *handler(params) {
    yield { type: 'state', states: { box: { text: 'pinged', crash: params.crash === true } } };
  },
});
