import type { RouteModule } from '../../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../../layouts/surface.js';

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">',
      stateSlots('demo:controls', 'demo:timeline', 'demo:output'),
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  transition: 'stream-demo',

  initial: () => ({
    'page:header': { title: 'Streaming Demo', nav: 'streaming' },
    'demo:controls': {
      description:
        'Click a button to fire a transition that demonstrates different frame types. Watch the timeline and output update in real time.',
    },
    'demo:timeline': { frames: [] },
    'demo:output': { activeKeys: [] },
  }),
} satisfies RouteModule;
