import type { RouteModule } from 'state-surface';
import { baseSurface, joinSurface, stateSlots } from '../../layouts/surface.js';
import { getLang } from '../../shared/i18n.js';
import { actionsContent } from '../../shared/content.js';

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

  initial: req => actionsContent(getLang(req)),
} satisfies RouteModule;
