import { fixtureManifest } from './manifest.js';
import * as staticPage from './pages/static.js';
import * as docs from './pages/docs.js';

export { createHandler, isPrerendered, staticParams } from './manifest.js';
export const manifest = fixtureManifest([
  ['/static', staticPage],
  ['/docs/:slug', docs],
]);
