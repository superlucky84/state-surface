import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../layouts/surface.js';

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">',
      stateSlots('search:input', 'search:results'),
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  transition: 'search',

  initial: () => ({
    'page:header': { title: 'Search', nav: 'search' },
    'search:input': { query: '' },
  }),
} satisfies RouteModule;
