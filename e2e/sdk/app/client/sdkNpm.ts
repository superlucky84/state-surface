import * as Sentry from '@sentry/browser';
import { datadogRum } from '@datadog/browser-rum';

// Default npm installs pointed at this origin (DSN host and RUM proxy) instead of a vendor.
const origin = location.origin;
Sentry.init({
  dsn: `${location.protocol}//public@${location.host}/intake/1`,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
  tracePropagationTargets: [origin],
});
datadogRum.init({
  applicationId: '00000000-0000-4000-8000-000000000000',
  clientToken: 'pub00000000000000000000000000000000',
  site: 'datadoghq.com',
  service: 'state-surface-sdk-fixture',
  env: 'e2e',
  proxy: `${origin}/intake/datadog`,
  sessionSampleRate: 100,
  sessionReplaySampleRate: 0,
  trackResources: true,
  trackUserInteractions: true,
  allowedTracingUrls: [origin],
});
// The test flushes through the same API the CDN bundle exposes.
(window as unknown as { Sentry: typeof Sentry }).Sentry = Sentry;
(window as unknown as { __ddRum: typeof datadogRum }).__ddRum = datadogRum;
