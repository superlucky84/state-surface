import type { StateFrame } from '../../../shared/protocol.js';
import { defineTransition } from '../../../server/transition.js';
import { isValidLang } from '../../../shared/i18n.js';
import type { Lang } from '../../../shared/i18n.js';
import { pageContent } from '../../../shared/content.js';
import type { PageKey } from '../../../shared/content.js';

const VALID_PAGES: PageKey[] = ['home', 'guide', 'streaming', 'actions', 'search', 'chat'];

async function* switchLang(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const lang: Lang = isValidLang(params.lang) ? params.lang : 'en';
  const page = VALID_PAGES.includes(params.page as PageKey)
    ? (params.page as PageKey)
    : 'home';

  const states = pageContent(page, lang, params);

  // Remove undefined values (e.g. search:results when no query)
  const cleanStates: Record<string, any> = {};
  for (const [k, v] of Object.entries(states)) {
    if (v !== undefined) cleanStates[k] = v;
  }

  yield {
    type: 'state',
    states: cleanStates,
  };

  yield { type: 'done' };
}

export default defineTransition('switch-lang', switchLang);
