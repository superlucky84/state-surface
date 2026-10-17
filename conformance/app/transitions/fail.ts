import { defineTransition } from 'state-surface/server';

export default defineTransition(async function* () {
  yield { type: 'state', states: { value: { n: 0 } } };
  throw new Error('secret-transition-detail');
});
