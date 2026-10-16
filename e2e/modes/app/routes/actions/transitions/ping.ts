import { defineTransition } from 'state-surface/server';

// Targets a static slot: content stays (V-01) while the UI patch applies.
export default defineTransition('ping', async function* () {
  yield {
    type: 'state',
    states: { note: { text: 'changed by frame' } },
    ui: { note: { classAdd: ['pinged'] } },
  };
  yield { type: 'done' };
});
