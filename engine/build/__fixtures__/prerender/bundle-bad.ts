import { fixtureManifest } from './manifest.js';
import * as docs from './pages/docs.js';

export { createHandler, isPrerendered, staticParams } from './manifest.js';
export const manifest = fixtureManifest([
  ['/docs/:slug', { ...docs, getStaticPaths: () => [{ slug: 'a/b' }] }],
]);
