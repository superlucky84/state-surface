import type { SurfaceContext } from 'state-surface/server';
import { defineTransition, TransitionError } from 'state-surface/server';
import type { StateFrame } from 'state-surface';
import { getLang, isValidLang } from '../../../shared/i18n.js';
import type { Lang } from '../../../shared/i18n.js';
import { guideContent, guideLoadingState, guideLoadedState } from '../../../shared/content.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function* guideLoad(
  params: Record<string, unknown>,
  ctx: SurfaceContext
): AsyncGenerator<StateFrame, void, unknown> {
  const slug = (params.slug as string) ?? 'surface';
  const lang: Lang = isValidLang(params.lang) ? params.lang : getLang(ctx);
  const guide = guideContent(slug, lang);

  if (!guide) throw new TransitionError(`Guide "${slug}" not found`);

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
}

export default defineTransition('guide-load', {
  targets: ['page:header', 'guide:toc', 'guide:content'],
  handler: guideLoad,
});
