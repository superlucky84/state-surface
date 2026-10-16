import { defineTransition } from 'state-surface/server';

// Server slot: the server re-renders the HTML and the browser applies it with the UI patch;
// the page still needs no Lithent. The engine sends `done` when the handler returns.
export default defineTransition(async function* () {
  yield {
    type: 'state',
    states: { note: { text: 'static note' } },
    ui: { note: { classAdd: ['pinged'] } },
  };
});
