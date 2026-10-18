import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

/**
 * V-31 fixture build (stage 10): client + Node server of e2e/sdk/app, and the Sentry Loader
 * template from Sentry's public repository (the script js.sentry-cdn.com/<key>.min.js
 * serves, filled in by server/loader.server.ts). It is downloaded, not committed; without
 * network access the Loader variant is skipped.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, 'app');
const LOADER =
  'https://raw.githubusercontent.com/getsentry/sentry/master/src/sentry/templates/sentry/js-sdk-loader.min.js.tmpl';

await build({ root: app, configFile: path.join(app, 'vite.config.ts') });
await build({
  root: app,
  configFile: path.join(app, 'vite.config.ts'),
  build: {
    ssr: path.join(app, 'server/main.ts'),
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'server.mjs' } },
  },
});
try {
  const response = await fetch(LOADER, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await writeFile(path.join(app, 'dist/sentry-loader.min.js.tmpl'), await response.text());
  console.log('Sentry Loader template downloaded');
} catch (error) {
  console.warn(`Sentry Loader template not available (${error.message}): Loader variant skipped`);
}
