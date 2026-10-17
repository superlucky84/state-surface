# Server core and adapters (stage 1)

The server core accepts Web `Request` and returns `Response`. It imports no Node,
Express, process environment, or filesystem scanning code. Application discovery
runs in the Vite plugin: `virtual:state-surface/manifest` statically imports `.tsx` pages,
transitions and the client asset manifest. Production startup does not
scan or dynamically import application files. Static assets are read by adapters.
The generated module initializes application-wide build configuration (asset map
and BASE_PATH) once; request data lives only in `SurfaceContext`.

Since stage 2 pages are `.tsx` page functions with `<Slot>` boundaries and the engine assembles
the document (doctype, comment markers, managed head tags with the request nonce). The v1
state-frame format stays until projection changes in stage 4.

```ts
import { createHandler, sequence } from 'state-surface/server';

const handler = createHandler({
  manifest,
  bodyLimit: 100 * 1024, // bytes, enforced while reading the request stream
  transitionTimeout: 30_000,
  middleware: [
    async (ctx, next) => {
      // ctx.request, url, params, cookies, locals, env, platform, nonce, signal, route
      const response = await next();
      response.headers.set('X-App', 'surface');
      return response;
    },
  ],
  onError(error, ctx) {
    /* send errors to application instrumentation */
  },
});
const response = await handler.fetch(request, { env: bindings });
```

`sequence(a, b)` uses onion ordering; calling `next()` twice is an error. Middleware
can return an early Response. Request kind is `ctx.route.kind`; `prerendered` is
currently false. `App.Locals` can be extended using a global interface declaration.
Server application callbacks receive explicit ctx, never an Express request shim.
`ctx.env` contains adapter-injected runtime bindings and must not be dumped.

Transition signature is `(params, ctx) => AsyncGenerator<StateFrame>`. Cookies
can be written until the first yield, when the engine commits response headers.
Later writes are ignored (with a development warning). First-yield failures discard
pending cookies. Page cookies are committed when the final response is built.
`ctx.cookies.set/delete` default to the application's BASE_PATH and SameSite=Lax.
`switch-lang` now writes its cookie in the transition; transition hooks were removed.

All POST requests check Origin, or Sec-Fetch-Site when Origin is absent. Cross-origin
and same-site-but-different-origin browser requests receive 403. Server clients
without either header remain supported. `security.allowedOrigins` is an explicit
allowlist; unknown tracing headers are accepted. Invalid JSON objects receive 400,
oversized bodies 413. SSR and unexpected transition exceptions are reported through
onError; production responses hide exception details. Explicit error frames retain
their application-supplied messages. A client abort or timeout closes the generator;
user generators must cooperate with ctx.signal to stop awaited external operations.

## Runtime entrypoints

| Adapter | Entry                                                                        | Runtime used for local validation |
| ------- | ---------------------------------------------------------------------------- | --------------------------------- |
| Node    | `serve({manifest})` from `state-surface/adapters/node`                       | Node 24.19.0                      |
| Express | `app.use(surface({manifest}))` from `state-surface/adapters/express`         | Express 5.2.1 on Node             |
| Bun     | `serve({manifest, env})` from `state-surface/adapters/bun`                   | Bun 1.3.0                         |
| Deno    | `serve({manifest})` from `state-surface/adapters/deno`                       | Deno 2.5.4                        |
| Workers | `export default worker({manifest})` from `state-surface/adapters/cloudflare` | Wrangler 4.151.0 / workerd        |

Express is an optional peer. Mount `surface()` before express.json(), urlencoded()
or any other middleware that consumes the request body. Mount at the application
root and use handler BASE_PATH for subpaths. Node/Express infer the URL origin from
the TLS socket and Host; behind TLS termination configure a trusted public `origin`
on the adapter rather than trusting arbitrary forwarded headers.

Node/Bun/Deno static directories default to `dist/client`. Adapters serve asset paths
under BASE_PATH, enforce the static-root boundary, and set MIME and hashed-asset
cache headers. HTML stays in the core, including prerendered HTML (below).
`node()`/`express()`/`bun()`/`deno()`/`cloudflare()` export adapter descriptors with
name, serverEntry, supports and readStatic. Node, Express, Bun and Deno also pass an
image service to `/_surface/image` (sharp, disk cache in `SURFACE_IMAGE_CACHE` or the
temp directory); Workers have none and answer 404 there (see Images below).

Deno defaults to reading its environment once; run with `--allow-net --allow-read=dist/client
--allow-env`. Applications can instead supply `env` explicitly and grant only named
environment permissions, as the conformance runner does. Bun likewise accepts
explicit env bindings; callers choose which process values to expose.

Configure Vite using `surface({adapter: bun()})` etc. and build the corresponding
entry with `vite build --ssr virtual:state-surface/entry --outDir dist --emptyOutDir false`
after the client build. The default descriptor/entry is Node. Custom Express apps
may keep their own entry and mount surface directly. Development uses Vite and the
same web core through the Node transport. `pnpm dev` replaces the previous tsx watcher.
BASE_PATH is fixed in the generated application build; a mismatched runtime override
is rejected instead of serving stale URLs.

Workers must bind `ASSETS`, use `run_worker_first` for HTML, and enable the
[`enable_request_signal` flag](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-requestsignal-for-incoming-requests).
The adapter uses a native TransformStream writer and idle NDJSON empty-line
heartbeats (default 250 ms, configurable `streamHeartbeatMs`) to detect disconnects
while a generator awaits data, then cancels the upstream reader. The existing decoder
ignores these blank lines; they are not state frames. waitUntil retains cleanup work.
This was necessary for idle-stream cancellation under local workerd even with the
request-signal flag. No client assertions are skipped to accommodate this behavior.
Worker CPU and post-disconnect waitUntil limits remain platform constraints.

## Prerendered pages

Pages opt in with `export const prerender = true` (or `surface({ prerender: true })`
with `export const prerender = false` to opt out); dynamic routes list their params
with `getStaticPaths()`. Under `routes/[lang]/` with `surface({ i18n })`, entries
without `lang` are built for every locale, and a route whose only param is `lang`
needs no `getStaticPaths()`. `pnpm build` writes `dist/client/<path>/index.html` and,
for language routes, a language-less copy of the default language with a canonical
link. A prerendered page cannot read cookies, request headers, `locals`, `flash` or
the nonce: the build fails at the line that tried.

Behind any adapter the request still goes through the core: middleware runs with
`ctx.route.prerendered === true` (it may answer early, e.g. 401), then the built HTML
is read with `readStatic` and answered with `ETag: "<buildId>"`, 304 on a match and
`Cache-Control: public, max-age=0, must-revalidate`. Prerendered HTML has no nonce,
so a CSP for those pages uses `script-src 'self'`. Workers need
`assets.html_handling: "none"` and `run_worker_first: true` so HTML reaches the worker.
Without a static reader (dev, tests) prerendered pages render on each request with
the same restricted context.

### Static hosting without a server

`dist/client` alone can be uploaded to a static host (Cloudflare Pages, Netlify, S3 +
CDN). Only prerendered pages and assets work there; everything that needs a request
does not:

- no middleware: no authentication, no per-request headers or redirects;
- no transitions, JS-less forms (`/_surface/action`), deferred slots, SSR pages or
  `/_surface/image` (remote images in prerendered pages are already static files);
- no language redirect: `/` serves the default-language copy with its canonical link,
  and `?lang=` switch links simply open the other language's page;
- headers come from the host's configuration, for example a `_headers` file:

```text
/assets/*
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff
/*
  Cache-Control: public, max-age=0, must-revalidate
  Content-Security-Policy: script-src 'self'; object-src 'none'; base-uri 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

Build with the BASE_PATH the host serves under; it is part of every URL in the HTML.

## Images

`import hero from './hero.png'` gives an `ImageAsset`; `pnpm build` writes WebP (and
`images.formats: ['avif']`) variants at `images.widths` (default 640…2048, never above
the original) to `dist/client/assets/`, so local images are optimized on every runtime,
Workers included. Remote images need an `images.remotePatterns` entry plus `width` and
`height`; Node, Express, Bun and Deno resize them through `/_surface/image` (configured
widths only, no redirects, image content types, 20MB and 10s limits), prerendering
turns them into static files, and Workers use the original URL unless
`images.cloudflare` delegates to Cloudflare Images (`/cdn-cgi/image/…`).

## Handler options for dev and production

`surface.server.ts` (or `surface({ handler: 'path' })`) default-exports the handler options:
`middleware`, `onError`, `limits`, `bodyLimit`, `security`, `secret`, `logger`. The `vite` dev
server uses them, and so does every production entry through `virtual:state-surface/handler`:

```ts
// surface.server.ts
import type { HandlerConfig } from 'state-surface/server';
export default { middleware: [auth, securityHeaders], onError: report } satisfies HandlerConfig;

// server.ts (Node; the other adapters spread the same object)
import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { serve } from 'state-surface/adapters/node';
await serve({ ...handler, manifest });
```

Without the file the module is `{}`. The file is server-only (`.server.ts`): a browser import fails
the build.

## Source maps

`surface({ sourcemap: 'hidden' })` writes source maps of the original TSX next to the client chunks
in `dist/client/assets/` without a `sourceMappingURL` comment (`true` adds the comment); the server
bundle always gets `dist/server.js.map` (`node --enable-source-maps dist/server.js`). A
`build.sourcemap` in the Vite config wins. The adapters serve whatever is in `dist/client`, so upload
hidden maps and delete them before deploying:

```sh
pnpm build
# Sentry: inject debug IDs into the chunks and maps, then upload both
npx @sentry/cli sourcemaps inject dist/client/assets
npx @sentry/cli sourcemaps upload --release "$RELEASE" dist/client/assets
# Datadog: minified files are matched by URL
npx @datadog/datadog-ci sourcemaps upload dist/client/assets \
  --service my-app --release-version "$RELEASE" --minified-path-prefix "https://example.com/assets"
find dist/client -name '*.map' -delete
```

With BASE_PATH the public URL prefix includes it (`https://example.com/demo/assets`). The maps
contain the original sources (`sourcesContent`); keep them out of public storage.

## Validation

```sh
pnpm test
pnpm typecheck:server
pnpm build
pnpm test:legacy          # 9 SSR documents + 2 streams versus saved Express output
pnpm test:e2e
pnpm build:conformance
pnpm check:core           # inspect portable source and bundled import graph
pnpm test:conformance node
pnpm test:conformance express
pnpm test:conformance bun
pnpm test:conformance deno
pnpm test:conformance cloudflare
pnpm test:conformance:app # the same scenarios on `vite` dev and on a surface() production build
```

All adapters run the same fixture and eight HTTP scenarios, including progressive
streaming, cookie timing, cancellation over a dedicated socket, SSR/errors,
middleware, CSRF/body limits, BASE_PATH and static assets. `BUN_BINARY` and
`DENO_BINARY` may select installed runtimes. Servers use their own process group,
check startup, preserve failure status and are stopped in finally. Core source and
bundle checks are required in CI, alongside the five runtime jobs. The saved legacy
snapshot was captured before refactoring and normalizes only the removed SSR hash.

`conformance/app` is the fixture as a surface() app (pages, transitions, `surface.server.ts`). Its
dev server and its production build answer the same scenarios; the expected differences are the
development error detail, prerendered pages rendered on request in dev (no ETag/304) and Vite's
cache headers for public files.
