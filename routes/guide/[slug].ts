import type { RouteModule } from '../../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../../layouts/surface.js';

const VALID_SLUGS = ['surface', 'template', 'transition', 'action'];

function parseSlug(req: { params: Record<string, string> }): string {
  const slug = req.params.slug;
  if (!VALID_SLUGS.includes(slug)) {
    throw new Error(`Invalid guide slug: "${slug}"`);
  }
  return slug;
}

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl gap-8 pb-8 pt-4 md:pt-6">',
      '<div class="hidden w-56 shrink-0 md:block">',
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

  params: req => ({ slug: parseSlug(req) }),

  initial: req => {
    const slug = parseSlug(req);
    return {
      'page:header': { title: 'Guide', nav: 'guide' },
      'guide:toc': { slug, items: VALID_SLUGS },
      'guide:content': { slug, loading: true },
    };
  },

  boot: {
    auto: true,
    params: req => ({ slug: parseSlug(req) }),
  },
} satisfies RouteModule;
