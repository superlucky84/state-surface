// Stands in for the prerender bundle the plugin builds (virtual:state-surface/prerender).
import { defineManifest } from '../../../server/core/manifest.js';
import type { PageModule } from '../../../shared/routeModule.js';

export { createHandler } from '../../../server/core/handler.js';
export { isPrerendered, staticParams } from '../../../server/core/manifest.js';

export const fixtureManifest = (routes: Array<[string, PageModule]>) =>
  defineManifest({
    buildId: 'fixture',
    routes: routes.map(([pattern, module]) => ({ pattern, module })),
    transitions: {},
  });
