import type { SurfaceContext } from 'state-surface/server';
import { defineTransition } from 'state-surface/server';
import type { StateFrame } from 'state-surface';
import { getLang, isValidLang } from '../shared/i18n.js';
import type { Lang } from '../shared/i18n.js';
import { searchContent, searchResults } from '../shared/content.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function* search(
  params: Record<string, unknown>,
  ctx: SurfaceContext
): AsyncGenerator<StateFrame, void, unknown> {
  const query = (params.query as string) ?? '';
  const lang: Lang = isValidLang(params.lang) ? params.lang : getLang(ctx);

  const base = searchContent(lang, query);

  // Frame 1: full — show header + input + loading results
  yield {
    type: 'state',
    states: {
      ...base,
      'search:results': { loading: true, query },
    },
  };

  await delay(300);

  // Frame 2: partial — update results only
  const items = searchResults(lang, query);

  yield {
    type: 'state',
    full: false,
    states: {
      'search:results': { loading: false, query, items },
    },
    changed: ['search:results'],
  };
}

export default defineTransition(search);
