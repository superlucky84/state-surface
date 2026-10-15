# Server core and adapters (stage 1)

The server core accepts Web `Request` and returns `Response`. It imports no Node,
Express, process environment, or filesystem scanning code. Application discovery
runs in the Vite plugin: `virtual:state-surface/manifest` statically imports routes,
transitions, templates and the client asset manifest. Production startup does not
scan or dynamically import application files. Static assets are read by adapters.
The generated module initializes application-wide build configuration (asset map
and BASE_PATH) once; request data lives only in `SurfaceContext`.

The existing string-layout route and v1 state-frame format remain in stage 1.
Page/Slot JSX replaces that API in stage 2; projection changes in stage 4.

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
cache headers. HTML stays in the core, including future prerender middleware.
`node()`/`express()`/`bun()`/`deno()`/`cloudflare()` export adapter descriptors with
name, serverEntry, supports and readStatic. Image transformation is not available
at Worker request time (stage 7 handles diagnostics).

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
```

All adapters run the same fixture and eight HTTP scenarios, including progressive
streaming, cookie timing, cancellation over a dedicated socket, SSR/errors,
middleware, CSRF/body limits, BASE_PATH and static assets. `BUN_BINARY` and
`DENO_BINARY` may select installed runtimes. Servers use their own process group,
check startup, preserve failure status and are stopped in finally. Core source and
bundle checks are required in CI, alongside the five runtime jobs. The saved legacy
snapshot was captured before refactoring and normalizes only the removed SSR hash.
