import { ClientRouter, Slot } from 'state-surface';
import Counter from '../routes/_components/Counter';
import Note from '../routes/_components/Note';
import { marker } from '../client/marker';

// The marker plugin attaches to the `box` slot of every router page (plugin lifetime check).
export const plugins = [marker];

// GTM-like tag manager (V-30): head snippet with the request nonce that injects an inline
// script (nonce propagated), an external script and an iframe at runtime, and counts CSP
// violations. Its nodes land outside the engine markers.
const TAG_MANAGER = `
window.dataLayer = window.dataLayer || [];
window.cspViolations = 0;
document.addEventListener('securitypolicyviolation', function () { window.cspViolations++; });
var nonce = document.currentScript.nonce;
var inline = document.createElement('script');
inline.nonce = nonce;
inline.setAttribute('data-gtm', 'inline');
inline.textContent = 'window.gtmInline = (window.gtmInline || 0) + 1;';
document.head.appendChild(inline);
var external = document.createElement('script');
external.src = '/assets/gtm-ext.js';
external.setAttribute('data-gtm', 'external');
document.head.appendChild(external);
document.addEventListener('DOMContentLoaded', function () {
  var frame = document.createElement('iframe');
  frame.id = 'gtm-frame';
  frame.srcdoc = '<p>tag</p>';
  document.body.appendChild(frame);
});`;

export default function RouterLayout(
  { title, nonce, counter = true }: { title: string; nonce: string; counter?: boolean },
  children: unknown
) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>{title}</title>
        <script nonce={nonce} innerHTML={TAG_MANAGER} />
        <ClientRouter dataLayer />
      </head>
      <body>
        <nav>
          <a id="to-a" href="/router/a">
            a
          </a>{' '}
          <a id="to-b" href="/router/b">
            b
          </a>{' '}
          <a id="to-c" href="/router/c">
            c
          </a>{' '}
          <a id="to-plain" href="/router/plain">
            plain
          </a>
        </nav>
        <iframe id="frame" src="/assets/frame.html" transition:persist="frame" />
        <audio id="player" src="/assets/silence.wav" loop transition:persist="player" />
        <label transition:persist="search-box">
          <input id="field" name="field" />
        </label>
        {counter && <Counter start={1} label="kept" client:load transition:persist="counter" />}
        <Slot name="box">
          <Note text={title} />
        </Slot>
        {children}
      </body>
    </html>
  );
}
