import { defineTransition, TransitionError } from 'state-surface/server';
import { object, text } from '../../shared/schema.js';
import { addComment } from '../../shared/actionsStore.server.js';
import { getLang } from '../../shared/i18n.js';

/**
 * `comments/add` (its path under transitions/). One definition serves three callers: the
 * JS-less form (PRG, result through `ctx.flash('comments/add')`), the same form streamed
 * when JavaScript runs, and `data-action`/`useAction` (DC-22).
 */
export default defineTransition({
  input: object({ body: text({ min: 1, max: 200 }) }),
  targets: ['actions:comments'],
  // Re-fill the textarea after a JS-less validation error.
  flash: { input: ['body'] },
  async *handler({ body }, ctx) {
    if (/^\s*error\s*$/i.test(body))
      throw new TransitionError('The demo refuses the word "error".');
    addComment(ctx, body);
    // The board is a server component: its load reads the store again.
    yield { type: 'state', states: { 'actions:comments': { lang: getLang(ctx) } } };
  },
});
