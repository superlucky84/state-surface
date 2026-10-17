import { defineTransition } from 'state-surface/server';

/**
 * `data-action="greet"` posts the form here. The transition yields the new state of its
 * target slot; the engine renders `<Greeting>` on the server and swaps its HTML.
 */
export default defineTransition({
  targets: ['home:greeting'],
  async *handler(params) {
    const name = String(params.name ?? '').trim() || 'world';
    yield { type: 'state', states: { 'home:greeting': { name } } };
  },
});
