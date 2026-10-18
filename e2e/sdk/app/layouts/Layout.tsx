import type { SurfaceContext } from 'state-surface/server';
import { ClientRouter, Slot } from 'state-surface';
import Box from '../routes/_components/Box';
import ErrorMessage from '../routes/_components/ErrorMessage';
import { probe } from '../client/probe';
import { sentryLoader } from '../server/loader.server';

export const plugins = [probe];

// Counts CSP violations from the first script on.
const VIOLATIONS = `window.cspViolations = [];
document.addEventListener('securitypolicyviolation', function (e) {
  window.cspViolations.push(e.violatedDirective + ' ' + e.blockedURI);
});`;

// Google's tag snippet for nonce CSPs; GTM-TEST serves the GTM runtime with an empty
// container (no tags, no hits).
const GTM = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;var n=d.querySelector('[nonce]');n&&j.setAttribute('nonce',n.nonce||n.getAttribute('nonce'));f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-TEST');`;

// Datadog's CDN async snippet with the same options as the npm install.
const datadog = (
  origin: string
) => `(function(h,o,u,n,d){h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}};d=o.createElement(u);d.async=1;d.src=n;n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)})(window,document,'script','https://www.datadoghq-browser-agent.com/us1/v7/datadog-rum.js','DD_RUM');
window.DD_RUM.onReady(function () {
  window.DD_RUM.init(${JSON.stringify({
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
  })});
});`;

/** `sdk` cookie: `npm` (client/entry.ts), `cdn` (Sentry Loader, Datadog snippet) or none. */
export default function Layout(
  { title, ctx }: { title: string; ctx: SurfaceContext },
  children: unknown
) {
  const sdk = ctx.cookies.get('sdk');
  const nonce = ctx.nonce;
  return (
    <html lang="en" {...(sdk ? { 'data-sdk': sdk } : {})}>
      <head>
        <meta charset="UTF-8" />
        <title>{title}</title>
        <script nonce={nonce} innerHTML={VIOLATIONS} />
        <script nonce={nonce} innerHTML={GTM} />
        {sdk === 'cdn' && <script nonce={nonce} innerHTML={sentryLoader(ctx.url)} />}
        {sdk === 'cdn' && <script nonce={nonce} innerHTML={datadog(ctx.url.origin)} />}
        <ClientRouter dataLayer />
      </head>
      <body>
        <nav>
          <a id="to-a" href="/a">
            a
          </a>{' '}
          <a id="to-b" href="/b">
            b
          </a>
        </nav>
        <h1>{title}</h1>
        <Slot name="box" mode="server">
          <Box text={title} />
        </Slot>
        <button id="ping" data-action="ping">
          ping
        </button>
        <button id="crash" data-action="ping" data-params='{"crash":true}'>
          crash
        </button>
        <button id="boom" data-action="boom">
          boom
        </button>
        <button id="app-error" type="button">
          app error
        </button>
        {children}
        <Slot name="system:error" mode="server" component={ErrorMessage} />
      </body>
    </html>
  );
}
