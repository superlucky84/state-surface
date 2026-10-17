import { defineManifest } from '../../../server/core/manifest.js';
import * as lang from './pages/lang.js';
import * as langDocs from './pages/langDocs.js';

export { createHandler, isPrerendered, staticParams } from './manifest.js';
export const manifest = defineManifest({
  buildId: 'fixture',
  i18n: { locales: ['en', 'ko'], defaultLocale: 'en' },
  site: 'https://docs.example',
  routes: [
    { pattern: '/:lang', module: lang },
    { pattern: '/:lang/docs/:slug', module: langDocs },
  ],
  transitions: {},
});
