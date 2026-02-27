import type { RouteModule } from '../../engine/shared/routeModule.js';
import { baseSurface, joinSurface } from '../../layouts/surface.js';
import { getLang } from '../../shared/i18n.js';
import { viewTransitionContent } from '../../shared/content.js';

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">',
      '<h-state name="vt:description"></h-state>',
      '<h-state name="vt:gallery"></h-state>',
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  transition: 'vt-demo',

  initial: req => viewTransitionContent(getLang(req)),
} satisfies RouteModule;
