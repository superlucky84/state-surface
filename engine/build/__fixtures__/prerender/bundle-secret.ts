import { fixtureManifest } from './manifest.js';
import * as secret from './pages/secret.js';

export { createHandler, isPrerendered } from './manifest.js';
export const manifest = fixtureManifest([['/secret', secret]]);
