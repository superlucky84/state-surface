import type { RouteModule } from 'state-surface';
import { baseSurface, joinSurface, stateSlots } from '../../layouts/surface.js';
import { getLang } from '../../shared/i18n.js';
import { uiPatchContent } from '../../shared/content.js';

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">',
      stateSlots('uipatch:controls', 'uipatch:preview'),
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  transition: 'ui-patch-demo',

  initial: req => uiPatchContent(getLang(req)),
} satisfies RouteModule;
