import type { StateFrame } from '../shared/protocol.js';
import { registerTransition } from '../server/transition.js';

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Article loading flow:
 *   full  → header + loading spinner
 *   partial → replace loading with article content
 *   partial → add comments panel
 *   done
 */
async function* articleLoad(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const articleId = (params.articleId as number) ?? 1;

  // Frame 1: full — show header + loading state
  yield {
    type: 'state',
    states: {
      'page:header': { title: 'Blog', nav: 'article' },
      'page:content': { loading: true, articleId },
    },
  };

  await delay(300);

  // Frame 2: partial — replace loading with article body
  yield {
    type: 'state',
    full: false,
    states: {
      'page:content': {
        loading: false,
        articleId,
        title: `Article #${articleId}`,
        body: `This is the content of article ${articleId}. Server-streamed progressively.`,
      },
    },
    changed: ['page:content'],
  };

  await delay(200);

  // Frame 3: partial — add comments (header stays untouched)
  yield {
    type: 'state',
    full: false,
    states: {
      'panel:comments': {
        articleId,
        comments: [
          { author: 'Alice', text: 'Great article!' },
          { author: 'Bob', text: 'Thanks for sharing.' },
        ],
      },
    },
    changed: ['panel:comments'],
  };

  yield { type: 'done' };
}

/**
 * Search flow:
 *   full  → header + search input + loading results
 *   partial → update results (input stays untouched)
 *   done
 */
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

export function registerDemoTransitions() {
  registerTransition('article-load', articleLoad);
  registerTransition('search', search);
}
