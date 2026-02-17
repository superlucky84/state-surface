import type { StateFrame } from '../../../shared/protocol.js';
import { defineTransition } from '../../../server/transition.js';
import { isValidLang } from '../../../shared/i18n.js';
import type { Lang } from '../../../shared/i18n.js';
import { guideContent, guideLoadingState, guideLoadedState } from '../../../shared/content.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function* guideLoad(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const slug = (params.slug as string) ?? 'surface';
  const lang: Lang = isValidLang(params.lang) ? params.lang : 'en';
  const guide = guideContent(slug, lang);

  if (!guide) {
    yield {
      type: 'error',
      message: `Guide "${slug}" not found`,
      template: 'system:error',
      data: { message: `Guide "${slug}" not found` },
    };
    return;
  }

  // Frame 1: full — TOC + loading content
  yield {
    type: 'state',
    states: guideLoadingState(slug, lang),
  };

  await delay(300);

  // Frame 2: partial — content loaded
  const loaded = guideLoadedState(slug, lang);
  if (loaded) {
    yield {
      type: 'state',
      full: false,
      states: { 'guide:content': loaded },
      changed: ['guide:content'],
    };
  }

  yield { type: 'done' };
}

export default defineTransition('guide-load', guideLoad);
