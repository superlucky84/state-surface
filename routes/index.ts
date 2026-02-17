import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../layouts/surface.js';
import { getLang } from '../shared/i18n.js';
import { homeContent } from '../shared/content.js';

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8 pt-4 md:pt-6">',
      stateSlots('page:hero', 'page:concepts', 'page:features'),
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  initial: req => homeContent(getLang(req)),
} satisfies RouteModule;
