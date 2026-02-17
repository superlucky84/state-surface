import type { RouteModule } from '../../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../../layouts/surface.js';

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">',
      stateSlots('actions:playground', 'actions:log'),
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  transition: 'action-demo',

  initial: () => ({
    'page:header': { title: 'Actions Playground', nav: 'actions' },
    'actions:playground': {
      lastAction: null,
      lastParams: null,
    },
    'actions:log': {
      entries: [],
    },
  }),
} satisfies RouteModule;
