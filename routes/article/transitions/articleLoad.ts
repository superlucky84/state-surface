import type { StateFrame } from '../../../shared/protocol.js';
import { defineTransition } from '../../../server/transition.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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

export default defineTransition('article-load', articleLoad);
