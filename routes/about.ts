import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface } from '../layouts/surface.js';

export default {
  layout: stateScript => {
    const body = `<main class="page">
  <h2>About StateSurface</h2>
  <p>A state-layout mapping runtime. Server owns state, client owns DOM projection.</p>
</main>`;
    return baseSurface(body, stateScript);
  },
} satisfies RouteModule;
