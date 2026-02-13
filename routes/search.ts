import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../layouts/surface.js';

export default {
  layout: stateScript => {
    const body = joinSurface('<main class="page">', stateSlots('search:input', 'search:results'), '</main>');
    return baseSurface(body, stateScript);
  },

  transition: 'search',

  initial: () => ({
    'page:header': { title: 'Search', nav: 'search' },
    'search:input': { query: '' },
  }),
} satisfies RouteModule;
