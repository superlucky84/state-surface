import { defineTransition } from 'state-surface/server';

export default defineTransition(async function* (_, ctx) {
  ctx.cookies.set('first', 'yes', { httpOnly: true });
  ctx.cookies.set('second', 'also');
  yield { type: 'state', states: { value: { n: 1 } } };
  await new Promise(resolve => setTimeout(resolve, 150));
  ctx.cookies.set('late', 'ignored');
  yield { type: 'state', full: false, states: { value: { n: 2 } }, changed: ['value'] };
});
