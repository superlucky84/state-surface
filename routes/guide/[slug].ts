import type { RouteModule } from 'state-surface';
import { baseSurface, joinSurface, stateSlots } from '../../layouts/surface.js';
import { getLang } from '../../shared/i18n.js';
import { guideLoadingState } from '../../shared/content.js';

const VALID_SLUGS = [
  'quickstart',
  'surface',
  'template',
  'transition',
  'action',
  'accumulate',
  'ui-patch',
];

function parseSlug(ctx: { params: Record<string, string> }): string {
  const slug = ctx.params.slug;
  if (!VALID_SLUGS.includes(slug)) {
    throw new Error(`Invalid guide slug: "${slug}"`);
  }
  return slug;
}

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8 pt-4 md:flex-row md:gap-8 md:pt-6">',
      '<div class="w-full md:w-56 md:shrink-0">',
      stateSlots('guide:toc'),
      '</div>',
      '<div class="min-w-0 flex-1">',
      stateSlots('guide:content'),
      '</div>',
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  transition: 'guide-load',

  params: ctx => ({ slug: parseSlug(ctx), lang: getLang(ctx) }),

  initial: ctx => guideLoadingState(parseSlug(ctx), getLang(ctx)),

  boot: {
    auto: true,
    params: ctx => ({ slug: parseSlug(ctx), lang: getLang(ctx) }),
  },
} satisfies RouteModule;
