import type { StateFrame } from '../../../shared/protocol.js';
import { defineTransition } from '../../../server/transition.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function* search(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const query = (params.query as string) ?? '';

  // Frame 1: full — show header + input + loading results
  yield {
    type: 'state',
    states: {
      'page:header': { title: 'Search', nav: 'search' },
      'search:input': { query },
      'search:results': { loading: true, query },
    },
  };

  await delay(400);

  // Frame 2: partial — update results only (header + input untouched)
  const results = query
    ? [
        { title: `Result 1 for "${query}"`, url: '#1' },
        { title: `Result 2 for "${query}"`, url: '#2' },
        { title: `Result 3 for "${query}"`, url: '#3' },
      ]
    : [];

  yield {
    type: 'state',
    full: false,
    states: {
      'search:results': { loading: false, query, items: results },
    },
    changed: ['search:results'],
  };

  yield { type: 'done' };
}

export default defineTransition('search', search);
