import type { SurfaceContext } from 'state-surface/server';
import { defineTransition, TransitionError } from 'state-surface/server';
import type { StateFrame } from 'state-surface';
import { paramLang } from '../shared/i18n.js';
import type { Lang } from '../shared/i18n.js';
import { viewTransitionContent } from '../shared/pages.js';

async function* vtDemo(
  params: Record<string, unknown>,
  ctx: SurfaceContext
): AsyncGenerator<StateFrame, void, unknown> {
  const lang: Lang = paramLang(params);
  const base = await viewTransitionContent(lang);
  const grid = { 'vt:description': base['vt:description'], 'vt:gallery': base['vt:gallery'] };
  const cardId = params.card as string | undefined;
  const back = params.back as boolean | undefined;

  if (back) {
    // Return to grid view
    yield {
      type: 'state',
      states: grid,
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
        'vt:description': base['vt:description'],
        'vt:gallery': {
          mode: 'detail',
          cards: cards,
          selected,
          backLabel: base.backLabel,
          lang,
        },
      },
    };
    return;
  }

  // Default: show grid
  yield {
    type: 'state',
    states: grid,
  };
}

// The gallery ↔ detail morph is an action-level View Transition (DC-06 ②).
export default defineTransition({ viewTransition: true, handler: vtDemo });
