import type { SurfaceContext } from 'state-surface/server';
import { defineTransition, TransitionError } from 'state-surface/server';
import type { StateFrame } from 'state-surface';
import { getLang, isValidLang } from '../shared/i18n.js';
import type { Lang } from '../shared/i18n.js';
import { viewTransitionContent } from '../shared/content.js';

async function* vtDemo(
  params: Record<string, unknown>,
  ctx: SurfaceContext
): AsyncGenerator<StateFrame, void, unknown> {
  const lang: Lang = isValidLang(params.lang) ? params.lang : getLang(ctx);
  const base = viewTransitionContent(lang);
  const cardId = params.card as string | undefined;
  const back = params.back as boolean | undefined;

  if (back) {
    // Return to grid view
    yield {
      type: 'state',
      states: base,
    };
    return;
  }

  if (cardId) {
    // Show detail view for selected card
    const cards = base['vt:gallery'].cards;
    const selected = cards.find((c: { id: string }) => c.id === cardId);

    if (!selected) throw new TransitionError(`Card "${cardId}" not found`);

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
    return;
  }

  // Default: show grid
  yield {
    type: 'state',
    states: base,
  };
}

// The gallery ↔ detail morph is an action-level View Transition (DC-06 ②).
export default defineTransition({ viewTransition: true, handler: vtDemo });
