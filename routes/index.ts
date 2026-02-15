import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../layouts/surface.js';

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8 pt-4 md:pt-6">',
      stateSlots('page:hero', 'page:recent-articles'),
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  initial: () => ({
    'page:header': { title: 'StateSurface', nav: 'home' },
    'page:hero': {
      badge: 'StateSurface v1',
      title: 'State-driven UI for MPA pages',
      description:
        'Server transitions stream state frames, and each page surface projects only its own slots.',
      primaryLabel: 'Open Article Demo',
      primaryHref: '/article/1',
      secondaryLabel: 'Try Search Demo',
      secondaryHref: '/search',
    },
    'page:recent-articles': {
      heading: 'Recent articles',
      articles: [
        {
          id: 1,
          title: 'Hydration Boundaries That Stay Stable',
          summary: 'Observe SSR -> hydration -> streamed partial updates without remount flicker.',
          href: '/article/1',
        },
        {
          id: 2,
          title: 'Frame Precedence in Practice',
          summary:
            'See how full frames and partial frames keep UI updates deterministic and predictable.',
          href: '/article/2',
        },
        {
          id: 3,
          title: 'Route-Level Surface Independence',
          summary:
            'Each route owns only its own slots, so page identity stays explicit across navigation.',
          href: '/article/3',
        },
      ],
    },
  }),
} satisfies RouteModule;
