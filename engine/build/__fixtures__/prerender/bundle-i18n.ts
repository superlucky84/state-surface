import { defineManifest } from '../../../server/core/manifest.js';
import * as lang from './pages/lang.js';

export { createHandler, isPrerendered } from './manifest.js';
export const manifest = defineManifest({
  buildId: 'fixture',
  i18n: { locales: ['en', 'ko'], defaultLocale: 'en' },
  site: 'https://docs.example',
  routes: [{ pattern: '/:lang', module: lang }],
  transitions: {},
});
