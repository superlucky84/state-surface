import type { SurfaceContext } from 'state-surface/server';
import { defineTransition } from 'state-surface/server';
import type { StateFrame } from 'state-surface';
import { paramLang } from '../shared/i18n.js';
import type { Lang } from '../shared/i18n.js';
import { searchContent, searchResults } from '../shared/pages.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function* search(
  params: Record<string, unknown>,
  ctx: SurfaceContext
): AsyncGenerator<StateFrame, void, unknown> {
  const query = (params.query as string) ?? '';
  const lang: Lang = paramLang(params);

  const base = await searchContent(lang, query);

  // Frame 1: full — show the input + loading results
  yield {
    type: 'state',
    states: {
      'search:input': base['search:input'],
      'search:results': { loading: true, query, labels: base.results },
    },
  };

  await delay(300);

  // Frame 2: partial — update results only
  const items = await searchResults(lang, query);

  yield {
    type: 'state',
    full: false,
    states: {
      'search:results': { loading: false, query, items, labels: base.results },
    },
    changed: ['search:results'],
  };
}

export default defineTransition(search);
