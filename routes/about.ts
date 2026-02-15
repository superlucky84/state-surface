import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface } from '../layouts/surface.js';

export default {
  layout: stateScript => {
    const body = `<main class="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8 pt-4 md:pt-6">
  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
    <h2 class="text-2xl font-semibold tracking-tight text-slate-900">About StateSurface</h2>
    <p class="mt-3 text-base leading-7 text-slate-600">
      A state-layout mapping runtime. Server owns state, client owns DOM projection.
    </p>
  </section>
</main>`;
    return baseSurface(body, stateScript);
  },
} satisfies RouteModule;
