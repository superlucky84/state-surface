import { defineTransition } from 'state-surface/server';

let turn = 0;

// A new number each time: the morph keeps the audio node and patches the text.
export default defineTransition(async function* () {
  yield { type: 'state', states: { player: { n: ++turn } } };
});
