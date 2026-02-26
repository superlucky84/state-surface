import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface, joinSurface } from '../layouts/surface.js';
import { getLang } from '../shared/i18n.js';
import { homeContent } from '../shared/content.js';

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8 pt-4 md:pt-6">',
      '<h-state name="page:hero"></h-state>',
      '<section class="border-t border-slate-200 pt-8">',
      '  <h2 class="mb-4 text-lg font-semibold text-slate-800">Core Concepts</h2>',
      '  <h-state name="page:concepts"></h-state>',
      '</section>',
      '<section class="border-t border-slate-200 pt-8">',
      '  <h2 class="mb-4 text-lg font-semibold text-slate-800">Features</h2>',
      '  <h-state name="page:features"></h-state>',
      '</section>',
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  initial: req => homeContent(getLang(req)),
} satisfies RouteModule;
