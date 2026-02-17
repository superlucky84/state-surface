import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../layouts/surface.js';
import { getLang } from '../shared/i18n.js';
import { searchContent } from '../shared/content.js';

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

  initial: req => searchContent(getLang(req)),
} satisfies RouteModule;
