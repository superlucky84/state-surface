import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The Sentry Loader (what https://js.sentry-cdn.com/<key>.min.js serves), from Sentry's
 * public template that e2e/sdk/build.mjs downloads: it injects the CDN bundle and calls
 * init with this config. Without the download the Loader variant is skipped.
 */
export const SENTRY_BUNDLE = 'https://browser.sentry-cdn.com/11.8.0/bundle.tracing.min.js';
const file = path.resolve('dist/sentry-loader.min.js.tmpl');

export const hasSentryLoader = () => existsSync(file);

export function sentryLoader(url: URL) {
  const config = {
    dsn: `${url.protocol}//public@${url.host}/intake/1`,
    tracesSampleRate: 1,
    tracePropagationTargets: [url.origin],
  };
  return readFileSync(file, 'utf8')
    .replace(/\{%[^%]*%\}/g, '')
    .replace("'{{ publicKey|safe }}'", JSON.stringify('public'))
    .replace("'{{ jsSdkUrl|safe }}'", JSON.stringify(SENTRY_BUNDLE))
    .replace('{{ config|to_json|safe }}', JSON.stringify(config))
    .replace('{{ isLazy|safe|lower }}', 'false')
    .replace(
      '{{ queueableApis|to_json|safe }}',
      JSON.stringify(['captureException', 'captureMessage', 'addBreadcrumb', 'setTag', 'setUser'])
    );
}
