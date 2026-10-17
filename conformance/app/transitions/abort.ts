import { defineTransition } from 'state-surface/server';
import { counters } from '../server/counters.server';

export default defineTransition(async function* (_, ctx) {
  try {
    yield { type: 'state', states: {} };
    await new Promise<void>(resolve => {
      if (ctx.signal.aborted) resolve();
      else ctx.signal.addEventListener('abort', () => resolve(), { once: true });
    });
  } finally {
    counters.aborted++;
  }
});
