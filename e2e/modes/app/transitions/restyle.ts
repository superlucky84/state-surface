import { defineTransition } from 'state-surface/server';

// DC-23: the server HTML of a CSS Modules component uses the class names of the page CSS.
export default defineTransition({
  targets: ['live'],
  async *handler() {
    yield { type: 'state', states: { live: { id: 'live', text: 'restyled', live: true } } };
  },
});
