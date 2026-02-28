import type { RouteModule } from 'state-surface';
import { baseSurface, joinSurface } from '../layouts/surface.js';
import { getLang } from '../shared/i18n.js';
import { searchContent } from '../shared/content.js';

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">',
      '<h-state name="search:input"></h-state>',
      '<h-state name="search:results" data-animate="fade"></h-state>',
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  transition: 'search',

  initial: req => searchContent(getLang(req)),
} satisfies RouteModule;
