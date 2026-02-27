import type { StateFrame } from '../../../../shared/protocol.js';
import { defineTransition } from '../../../../server/transition.js';
import { isValidLang } from '../../../../shared/i18n.js';
import type { Lang } from '../../../../shared/i18n.js';
import { viewTransitionContent } from '../../../../shared/content.js';

async function* vtDemo(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const lang: Lang = isValidLang(params.lang) ? params.lang : 'en';
  const base = viewTransitionContent(lang);
  const cardId = params.card as string | undefined;
  const back = params.back as boolean | undefined;

  if (back) {
    // Return to grid view
    yield {
      type: 'state',
      states: base,
    };
    yield { type: 'done' };
    return;
  }

  if (cardId) {
    // Show detail view for selected card
    const cards = base['vt:gallery'].cards;
    const selected = cards.find((c: { id: string }) => c.id === cardId);

    if (!selected) {
      yield {
        type: 'error',
        message: `Card "${cardId}" not found`,
        template: 'system:error',
        data: { message: `Card "${cardId}" not found` },
      };
      return;
    }

    yield {
      type: 'state',
      states: {
        'page:header': base['page:header'],
        'vt:description': base['vt:description'],
        'vt:gallery': {
          mode: 'detail',
          cards: cards,
          selected,
          backLabel: lang === 'ko' ? '갤러리로 돌아가기' : 'Back to Gallery',
          lang,
        },
      },
    };
    yield { type: 'done' };
    return;
  }

  // Default: show grid
  yield {
    type: 'state',
    states: base,
  };
  yield { type: 'done' };
}

export default defineTransition('vt-demo', vtDemo);
