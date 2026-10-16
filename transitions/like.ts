import { defineTransition } from 'state-surface/server';
import { integer, object } from '../shared/schema.js';
import { addLikes } from '../shared/actionsStore.server.js';
import { getLang } from '../shared/i18n.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Typed transition for `useAction(renew, 'like')`: `run({ delta })` is checked against the
 * schema's input type. Its targets do not overlap the playground's, so a like runs in
 * parallel with a slow playground action; `mode: 'queue'` runs rapid likes one by one.
 */
export default defineTransition({
  input: object({ delta: integer({ min: 1, max: 5 }) }),
  targets: ['actions:likes'],
  mode: 'queue',
  async *handler({ delta }, ctx) {
    await delay(1200);
    addLikes(ctx, delta);
    yield { type: 'state', states: { 'actions:likes': { lang: getLang(ctx) } } };
  },
});
