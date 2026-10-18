# StateSurface Protocol (v2: two layers)

This file is the implementation-facing contract for transitions. It follows
[docs/surface-expansion/DESIGN.md](docs/surface-expansion/DESIGN.md) 6장 (DC-09, DC-10, DC-13, DC-14),
which supersedes the single-layer frame contract of `docs/ui-protocol/DESIGN.md`.

There are two layers:

1. **Authoring layer** — what a transition yields or returns. Logical state frames
   (full · partial · accumulate · removed · ui). Public API.
2. **Transport layer** — what the server sends to the browser. Per-slot op lists. Engine
   internal; the browser executes ops in order and does not interpret merge rules.

```text
transition yields StateFrame ─▶ server: validate → request reducer → project per slot mode
                                 (server slot: render HTML, client slot: props / merge)
                              ─▶ { type: 'patch', reset?, ops: [...] } … { type: 'done' }
```

## Requests

- Endpoint: `POST {BASE_PATH}/transition/<name>`. The name is the transition file's path under
  `transitions/` without extension, kebab-case segments joined by `/` (`transitions/comment/add.ts`
  → `/transition/comment/add`); each segment is URL-encoded.
- Body (100 KiB default limit, 413 above): a JSON object, or `application/x-www-form-urlencoded` /
  `multipart/form-data` turned into an object (a repeated name becomes an array, files stay `File`
  values). Malformed or non-object bodies are 400. A `_redirect` field is removed.
- Input: a transition with an `input` Standard Schema validates the params before the handler.
  Invalid input never runs the handler: the response is **422** `application/json`
  `{ "frames": [{ "type": "error", "kind": "validation", "message", "fieldErrors", … }] }`
  (`fieldErrors`: field path → messages; the error slot is rendered as for other errors).
- Required headers (sent by the engine runtime):
  - `X-Surface-Build: <buildId>` — must equal the server's build id, else **409** (the browser
    reopens the current URL as a document load, once: running requests are aborted and later
    actions resolve `{ ok: false, aborted: true }` without a request).
  - `X-Surface-Page: <pageId>` — the page manifest used to resolve slots (route file path without
    extension, e.g. `[lang]/guide/[slug]`); missing or unknown is **400**. It is not an authorization
    input. The page's language is not sent: pages pass it in the params (`lang`) when the
    transition needs it.
- POST validates `Origin` (or `Sec-Fetch-Site` when `Origin` is absent); an allowed-origin list is
  configurable. Unknown request headers are accepted.
- Response: `application/x-ndjson` when the handler is an async generator (one JSON frame per line,
  empty lines ignored), `application/json` `{ "frames": [...] }` when it is an async function.
- Cookies set before the first frame are committed with the response headers; later writes are
  ignored (development warns).
- `X-Surface-View-Transition: 1` marks a transition declared with `viewTransition: true`.

## Authoring Layer

```ts
type StateFrame = {
  type: 'state';
  states: Record<string, any>;
  ui?: Record<string, UiPatch | null>;
  full?: boolean; // default true
  accumulate?: boolean; // default false
  changed?: string[];
  removed?: string[];
  uiChanged?: string[];
};

// async function transitions return one result, normalized to a full frame
type TransitionResult = {
  states?: Record<string, any>;
  ui?: Record<string, UiPatch | null>;
} | void;
```

Rules (violations: development throws with the transition name and frame number, production
sends an `error` frame and ends the request):

- The first state frame is **full**. Partial or accumulate first is invalid.
- There is **no `done`** in the authoring layer: when the handler returns, the engine sends it.
  Yielding `{ type: 'done' }` is invalid. Yielding `{ type: 'error' }` is invalid: **throw**.
  Throw `TransitionError` (from `state-surface/server`) for a message the user may see in
  production; other errors become `Transition failed` outside development.
- **Targets**: `defineTransition({ targets, handler })` declares the slots the transition may
  change. Without it, the slots of the first full frame become the targets. Any frame that touches
  a slot outside the targets, a slot that is not on the page, or a static slot is invalid.
- Each `states` value is the slot's component props: an object. Other values are invalid.
- `full` (default) replaces the **targets** — not the whole page. Target slots missing from a full
  frame are removed; slots outside the targets and static content stay.
- Partial (`full: false`) needs at least one of `changed`, `removed`, `uiChanged`. `changed` keys
  must exist in `states`, `removed` keys must not, and a key cannot be in both.
- Accumulate (`accumulate: true`) merges deltas: arrays concat, strings concat, other values
  replace (shallow). It cannot carry `removed` or `ui` and is never the first frame.
- UI patches: `classAdd`/`classRemove` are arrays of tokens matching `[A-Za-z0-9_:/\[\].-]+`;
  `cssVars` keys start with `--` and values must not contain `;`, `{`, `}`, `\`, `url(`,
  `image-set(`, `src(` or `expression(`. A full frame sets the UI of every target slot that keeps
  content (missing → cleared); a removed slot loses its UI.
- An empty handler (no frame) is a successful request: the engine sends only `done`.
- `reset: [slot]` (any frame except accumulate; keys must be in `states`) asks for a new instance
  of a client slot (DC-05): its `props` op carries `reset: true` and the browser remounts it, local
  state cleared. On a server or static slot it is invalid.

The slot state exists for **one request**. Every request starts empty; read what you need from a
server source again (DC-10). The server never trusts client snapshots.

### Valid examples

```json
{ "type": "state", "states": { "search:results": { "loading": true, "query": "q" } } }
{ "type": "state", "full": false, "states": { "search:results": { "items": [] } }, "changed": ["search:results"] }
{ "type": "state", "full": false, "states": {}, "removed": ["chat:typing"] }
{ "type": "state", "accumulate": true, "states": { "chat:current": { "text": " world" } } }
{ "type": "state", "full": false, "states": {}, "ui": { "card": { "classAdd": ["is-new"] } }, "uiChanged": ["card"] }
```

### Invalid examples

```json
{ "type": "state", "full": false, "states": { "a": {} } }
{ "type": "state", "full": false, "states": {}, "changed": ["a"] }
{ "type": "state", "full": false, "states": { "a": {} }, "removed": ["a"] }
{ "type": "state", "accumulate": true, "states": { "a": { "t": "x" } }, "removed": ["b"] }
{ "type": "state", "states": { "a": {} }, "ui": { "a": { "classAdd": "not-an-array" } } }
{ "type": "done" }
```

An accumulate or partial frame as the first frame is invalid as well.

### External frames

Frames from an outside source (an agent, a queue) enter only through the transition:
`yield* ctx.external(source)`. Each frame may only touch slots declared with `external` and a
Standard Schema `schema` (`<Slot external schema={s}>`); the values are validated by the schema.
A violating external frame is dropped and logged; the transition continues. There is no public
endpoint for frames.

## Transport Layer

```ts
type WireFrame =
  | { type: 'patch'; reset?: true; ops: Op[] }
  | { type: 'done' }
  | {
      type: 'error';
      message: string;
      kind?: 'validation' | 'timeout'; // input schema rejected the params · total/idle timeout
      fieldErrors?: Record<string, string[]>;
      slot?: string;
      html?: string;
      islands?: IslandMeta[];
      props?: object;
    };

type Op =
  | { slot: string; html: string; islands?: IslandMeta[] } // server slot
  | { slot: string; props: object; reset?: true } // client slot: replace props (reset: remount)
  | { slot: string; merge: object } // client slot: accumulate delta
  | { slot: string; remove: true } // any slot: cleanup and clear
  | { slot: string; ui: UiPatch | null }; // any slot: the slot's whole UI patch

type IslandMeta = {
  id: string;
  component: string;
  props: object;
  activation?: 'idle' | 'visible' | 'media';
  media?: string;
  only?: true;
  resetKey?: string[]; // prop names that identify the instance across morph
  capability?: 'unsafe'; // inside a capability="unsafe" slot: no browser attribute guard
};
```

```json
{"type":"patch","reset":true,"ops":[{"slot":"article:body","html":"<article>…</article>"},{"slot":"chat:current","props":{"text":""}},{"slot":"article:body","ui":null}]}
{"type":"patch","ops":[{"slot":"chat:current","merge":{"text":"Hel"}}]}
{"type":"done"}
```

Server projection:

- One authoring frame becomes at most one patch (`reset: true` for a full frame); a frame that
  changes server and client slots produces one patch with both kinds of ops.
- Within a patch: `remove` ops, then content ops, then `ui` ops.
- Server slots re-run `load` and render on every update, coalesced per slot: the first update
  renders immediately, later ones at most once per 33 ms, and pending renders are flushed before
  `done`/`error`. Client ops are not coalesced on the server.
- `html` contains only the output of the slot's registered component, rendered with the slot's
  capability (below). Islands inside it are listed in `islands`.

Browser state table (per request):

| State                        | Accepts                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| awaiting-baseline            | `reset` patch → active · `done` → completed (empty success) · `error` → failed · other patch → protocol error |
| active                       | patch → active · `done` → completed · `error` → failed                                                        |
| completed / failed / aborted | nothing (later frames are ignored)                                                                            |

- EOF without `done` or `error` is an error; applied ops are not rolled back.
- A line that is not JSON stops the request: a lost frame would leave later deltas wrong.
- The browser re-checks op structure only. A malformed content op, an unknown op (version
  mismatch), any op for a static slot or an op whose kind does not match the slot mode stops the
  request; an invalid `ui` op is skipped and traced.
- A `ui` op replaces the slot's previous patch: the browser first undoes it (classes it added or
  removed, variables it set), so the host shows its SSR classes and style plus the latest patch,
  however the patches were coalesced.
- Queued ops are coalesced once per animation frame: per slot the last `html`/`props` wins,
  `merge` folds into the preceding `props`/`merge`, ops after `remove` are a new appearance.
- Concurrency (DC-11, DC-30): a new request aborts running requests of the same name and those
  whose targets overlap its own; requests with disjoint targets run in parallel. A transition
  without declared targets overlaps every slot (it aborts everything and anything aborts it;
  development warns once). `mode: 'queue'` runs requests of one name in order. Targets and queue
  mode come from the bootstrap `actions`. An aborted request's queued ops and DOM work are dropped.
- Pending: each request marks its anchors (`data-pending-targets`, else its targets, else every
  slot) with `data-pending` until it ends (done, error or abort) and with `data-has-result` once
  its first patch is applied. Marks are counted per anchor, so one request's end does not clear
  another's.
- View Transitions (DC-06): updates apply immediately. A request marked by
  `X-Surface-View-Transition`, `data-view-transition`, or a patch that changes a slot declared with
  `<Slot viewTransition>` (first appearance included) wraps its first such patch in one
  `startViewTransition()`; later patches of the request apply immediately, in stream order. Without
  the API or with `prefers-reduced-motion: reduce` everything applies immediately, and reduced
  motion also skips the `data-just-updated` mark of `data-animate` slots.
- `error`: when `slot` names a slot on the page, its `html` (server slot) or `props` (client slot)
  is shown there regardless of targets; it is cleared by the next request's baseline. Without an
  error slot nothing is shown; development warns. Both cases call `reportError` (validation errors
  do not).
- Result: `run()` / the runtime resolve `{ ok: true }`, `{ ok: false, aborted: true }` or
  `{ ok: false, error }` with `error.kind` `server` (error frame), `validation` (with
  `fieldErrors`), `timeout`, `http` (status without frames), `network`, `protocol` (wire
  violation) or `chunk` (a slot's component could not load).

Receive limits (browser and server, configurable with `createHandler({ limits })`): one NDJSON
line 1 MB, one response 32 MB, 10,000 ops per request, one `html` op 512 KB, 30 s idle between
frames and 5 minutes per request. Development warns at 80%.

Runtime trace: `onTrace(listener)` from `state-surface/client` (production too, e.g. in
`client/entry.ts`) receives `received`, `applied`, `merged`, `dropped`, `skipped`, `done`, `error`
and `warning` events. Warnings: a frame protocol violation (the request fails) and an op for a slot
that is not on the page (ignored). Development also logs them and warns about undeclared targets,
scripts in slot HTML and plugin hooks that change DOM inside client slots or islands; those checks
are compiled out of production bundles. `?debug=1` shows the trace and warnings in an overlay.
Errors the loader reports (chunk, plugin and hydration failures) are traced as `error` events and
passed to `reportError`.

## Server HTML Application

- `swap="replace"` (default): plugin cleanup → dispose islands in the slot → `innerHTML` →
  restore focus, selection and scroll by element `id` → plugin `attach` → activate `islands`.
- `swap="morph"`: idiomorph 0.7.4 (own chunk, loaded only on pages with a morph slot) patches the
  DOM; an island with the same component and props keeps its instance, one with changed props but
  the same `resetKey` values keeps it and receives the new props, any other is disposed and
  activated again (IC-06, DC-05); plugins get `update`.
- Scripts inside applied HTML never run; development warns.

## Capability

| Capability       | Slot content                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| strict (default) | Component props only. No raw HTML (`innerHTML`, `srcdoc` are errors). Event handler attributes in any letter case are dropped, and so are URL attributes (`href`, `src`, `action`, `formaction`, `poster`, `cite`, `background`, `xlink:href`, `<object data codebase>`, SVG `<animate>`/`<set>` values written into `href`) outside http, https, mailto and relative references. |
| rich             | strict plus Markdown through `Markdown` from `state-surface/rich` (mdast → hast allowlist, raw HTML dropped).                                                                                                                                                                                                                                                                     |
| unsafe           | Raw HTML allowed; `<script>` is made inert (in `srcdoc` too). Event handler attributes and `javascript:` URLs inside that HTML are not removed: render untrusted HTML with `sandbox="iframe"` (a sandboxed iframe `srcdoc` without scripts).                                                                                                                                      |

Capability is fixed by the page manifest; a frame cannot raise it. The browser applies the same
attribute rules to client components that render frame data: client slots and islands inside a
slot (not `capability="unsafe"`; `capability: "unsafe"` in their bootstrap metadata). A
MutationObserver removes the attributes in the microtask after each render, before any later
task (a click, an `onerror`, a queued `javascript:` navigation) can use them. Islands in page or
layout markup are app code and are not guarded.

## Stylesheets

The head links the global stylesheets (`client/styles.css`), then the page's stylesheets
(`<link rel="stylesheet" data-ss>`, engine-less pages included): every stylesheet imported in the
page's module graph, CSS Modules of static and server components and of islands (their chunk CSS
too, so islands are styled before they activate). Class names come from the same module in SSR,
server HTML swaps and client renders. Client navigation loads the next page's new stylesheets
before the swap and drops the stylesheets the next page does not link.

## Bootstrap

One JSON script per page (written only when the page needs the engine or has an app entry):

```html
<script id="__SURFACE__" type="application/json">
  {
    "buildId": "…",
    "pageId": "examples/search",
    "basePath": "",
    "slots": [
      { "id": "search:input", "mode": "server", "swap": "morph" },
      { "id": "chat:current", "mode": "client", "component": "routes/…/chatCurrent.tsx#default" },
      {
        "id": "$0",
        "mode": "client",
        "component": "…#default",
        "props": {},
        "activation": "visible"
      }
    ],
    "boot": [{ "transition": "guide-load", "params": { "slug": "quickstart" } }],
    "plugins": [{ "id": "client/plugins/prism.ts#prism", "load": "load" }],
    "actions": { "guide-load": { "targets": ["page:header", "guide:toc", "guide:content"] } }
  }
</script>
```

- `<`, `>`, `&`, U+2028 and U+2029 are written as `\u` escapes.
- Server slots carry no props; client slots and islands carry their SSR snapshot props.
- Island ids: `$N` at page level, `<slot>$N` inside a slot. Hosts are `<h-island data-island="id">`.
- `defer` holds the sealed token of a deferred server slot (below).
- `resetKey` (client slots and islands): prop names; a new value remounts the instance.
- `actions`: targets and `queue` of the transitions that declare them (others overlap everything).
- `router` (only on pages that render `<ClientRouter />`): its options, see Client Router below.
- `persist` / `persistProps` (client slots and islands): the persist ID and the keep-props flag.
- `capability: "unsafe"` (client slots and slot islands of a `capability="unsafe"` slot): the
  browser does not guard their attributes (Capability below).
- Page responses carry `X-Surface-Build`; a page whose chunk failed twice compares it with its
  `buildId` and reloads on the next interaction when they differ.

## Deferred Server Slots

`<Slot name="cart" mode="server" server:defer fallback={…} cache="public, max-age=60">` renders the
fallback during SSR and a token: the slot props, componentId, slot name, buildId and capability,
encrypted with AES-GCM using a key derived (HKDF-SHA256, `state-surface/defer/v1`) from
`SURFACE_SECRET` (or the build-generated secret; `SURFACE_SECRET_PREVIOUS` decrypts during
rotation; secrets shorter than 32 bytes are rejected).

- `GET {BASE_PATH}/_surface/island/:componentId?p=<token>` (POST with the token as the body when it
  is longer than 2 KB) passes the middleware, decrypts and checks the token (400 when invalid, 409
  for another build), runs `load` and returns `{ "html": "…", "islands": [...] }`.
- `Cache-Control` is `private, no-store` unless the slot declares `cache` (GET only).
- The browser requests every deferred slot in parallel, drops a response when a transition already
  changed the slot, retries once after 1 s, then keeps the fallback and calls `reportError`.

## JS-less Form Submissions (PRG)

`<form method="post" action={actionUrl('comment/add')}>` posts to
`POST {BASE_PATH}/_surface/action/<name>` and works without JavaScript (DC-22 ③). With JavaScript
the engine intercepts the submit (`method="post"`, same origin, action under
`{BASE_PATH}/_surface/action/`) and runs the same transition as a stream.

- The request passes the middleware and the `Origin` / `Sec-Fetch-Site` check (403 otherwise);
  an unknown name is 404. The body is parsed and validated like a transition request.
- The handler runs to the end and its frames are dropped; the response is **303** with
  `Cache-Control: no-store`. `Location`: the `_redirect` field when it is a path inside BASE_PATH on
  this origin (starts with `/`, no `//`, `/\`, scheme or control characters), else a same-origin
  `Referer` whose path passes the same check, else the BASE_PATH root.
- The result travels in the `surface_flash` cookie (HttpOnly, SameSite=Lax, Max-Age 60, Secure
  on https): `base64url(JSON).base64url(HMAC-SHA256)` with the IC-09 flash key
  (`state-surface/flash/v1`; the previous secret also verifies). Payload:
  `{ n: name, e: expiry, ok, error?: { message, kind: 'validation' | 'server', fieldErrors? }, input? }`;
  `e` (Unix seconds, issue time + 60) is signed too, so a captured value is refused after the
  cookie's lifetime.
  `input` holds only the fields listed in `defineTransition({ flash: { input: [...] } })` and never
  files. A server error's message is the `TransitionError` message, else `Transition failed`
  outside development.
- Size limit 3 KB (`createHandler({ flashLimit })`): over it the input is dropped first, then the
  field errors (development warns).
- `ctx.flash(name)` reads the flash once on the next page request (the cookie is deleted); a
  flash for another name is left alone. Prerendered pages cannot read it.

## Prerendered Pages and Language Paths

- A prerendered page (`export const prerender = true`, DC-24) is answered after the middleware with
  the HTML the build wrote: `Content-Type: text/html`, `ETag: "<buildId>"` (an `If-None-Match`
  with the same value, `W/` ignored, is **304**), `Cache-Control: public, max-age=0,
must-revalidate`. A dynamic page answers only the params its `getStaticPaths()` listed (404
  otherwise). Its HTML carries no nonce; engine tags are the same as in a per-request render.
- With `surface({ i18n })`, `routes/[lang]/…` match only the configured locales. A GET without a
  language whose path exists under a language answers **302** to `/{lang}{path}{query}` (the
  `?lang=` value, then the `lang` cookie, then `Accept-Language`, then the default) with
  `Cache-Control: private, no-store` and `Vary: cookie, accept-language`. `?lang=xx` on a
  language page sets `lang=xx` (Max-Age one year, Path BASE_PATH) and answers **302** without the
  parameter; a request with `Purpose`/`Sec-Purpose` `prefetch` gets **204** and no cookie.
- Language pages write `<link rel="alternate" hreflang>` for every locale and `x-default` (the
  language-less URL) at the start of the managed head. Prerendered pages use `surface({ site })`
  as the origin, else root-relative URLs; the language-less copy of the default language adds
  `<link rel="canonical">`.

## Images

`GET {BASE_PATH}/_surface/image?url=<remote>&w=<width>&f=<webp|avif>` resizes an allowed remote
image (DC-26). It passes the middleware; the host must match `images.remotePatterns` (else
**403**), `w` must be one of `images.widths` and `f` an enabled format (else **400**). The server
fetches without following redirects, accepts only `image/*` up to 20 MB in 10 s, never enlarges,
and answers `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` (**502** when the
fetch or the encode fails, `Cache-Control: no-store`). Development also serves
`?src=<project path>` for imported images. Runtimes without an image service (Workers) answer
**404**; prerendering replaces these URLs with static files. Imported images are static files
under `/assets/` and never use this endpoint in production.

`<Image priority>` adds `<link rel="preload" as="image" imagesrcset imagesizes type
fetchpriority="high">` after the stylesheets of the managed head.

## Client Router

`<ClientRouter prefetch transition dataLayer cacheSize cacheTtl />` in the layout head (once per page,
page or layout markup only) makes links between router pages client navigations (DC-18). It renders
nothing; the page gets `router` in its bootstrap and the loader imports the router chunk. Pages
without it never load the chunk.

| Option                   | Values                                                       | Default    |
| ------------------------ | ------------------------------------------------------------ | ---------- |
| `prefetch`               | `hover` · `tap` · `viewport` · `load` · `false`              | `hover`    |
| `transition`             | `fade` (root View Transition) · `none`                       | `fade`     |
| `dataLayer`              | push `{ event: 'surface.page_view', page_path, page_title }` | off        |
| `cacheSize` / `cacheTtl` | prefetch cache entries / ms                                  | 20 / 30000 |

**Interception.** Same-origin `<a href>` inside BASE_PATH and `method="get"` forms (submitter
`formmethod`/`formaction`/`formtarget` respected; the query is the form data). The browser keeps
`data-action` elements, POST forms, `target` other than `_self`, `download`, modifier keys or other
buttons, hash-only changes, and anything inside `[data-surface-reload]`. `navigate(url, { replace })`
from `state-surface/client` uses the router when the page has one, else `location`.

**Pipeline.** Events on `document`, `detail = { from, to, direction, trigger, signal }`
(`trigger`: `link` · `form` · `popstate` · `api` · `load`; `direction`: `forward` · `back` · `replace`):

1. `surface:before-preparation` (cancelable: the router does nothing; the listener takes over) →
   the previous navigation aborts, actions abort unless all their targets persist,
   `<html data-surface-navigating>`.
2. `GET` with `Accept: text/html` (a prefetched entry is used once; back/forward always refetch).
3. Document load instead when: the fetch fails, the response is not HTML, it redirected to another
   origin, the next page has no router, or its `buildId` differs. A router page's 4xx/5xx HTML is
   swapped and its URL shown.
4. `surface:after-preparation` → new stylesheets load first (3 s cap) → `surface:before-swap`
   (`detail.swap` can be replaced) → swap inside one View Transition (skipped for
   `transition="none"`, reduced motion or no API) → `surface:after-swap` → the next page starts
   (plugins, components, deferred slots, `<Boot>`) → `surface:page-load` (also on document loads).

**Swap.** Only the marker regions change:

- `<html>`/`<body>` attributes: the previous page's layout attributes leave, the next page's apply;
  attributes and class tokens added by others stay.
- Head (`<!--ss:head-->` … `<!--/ss:head-->`): every element the engine rendered carries `data-ss`
  (plus `#__SURFACE__`); only those are merged. Stylesheets, module preloads and `script[src]` are
  kept by URL, other owned nodes (title, meta, inline scripts, the bootstrap) are replaced. Nodes
  without `data-ss` — a tag manager's inserts while the head was parsed — stay.
- Body (`<!--ss:body-->` … `<!--/ss:body-->`): the new content goes in beside the old, persisted
  elements move into it (`moveBefore`, `insertBefore` fallback), the old content leaves. Nodes after
  the end marker stay.
- Scripts: `src` scripts run once per URL per document; inline scripts run only with
  `data-surface-rerun`; re-run scripts get this document's nonce (`modulepreload` links carry the
  nonce too, for `'strict-dynamic'` CSP).
- History `state.__surface = { index, scroll }`, `scrollRestoration = 'manual'`; new pages scroll to
  the hash target or the top, back/forward restore the saved position. Focus stays inside a
  persisted element, else goes to `[autofocus]`, the hash target or `<main>` (`tabindex="-1"`); an
  `aria-live` region announces the title.

**Persist (DC-19).** `transition:persist="id"` on elements and islands, `transition:persist` on
client Slots (the slot name is the ID), `transition:persist-props` to keep the previous props. SSR
writes `data-surface-persist="id"`; IDs follow the slot name rule, are unique per page and are
allowed in page or layout markup only (not inside a Slot). Server and static slots cannot persist,
islands need an explicit name (build errors). The current and next element pair by ID when the tag
and the componentId match (else not kept, development warns); a kept island keeps its instance and
receives the next page's props unless `persist-props`, a changed `resetKey` remounts it, and plugins
get `update` on persisted slots. The next page's placeholder never enters the document.

**Prefetch (DC-20).** Strategy per link: `data-prefetch="hover|tap|viewport|load|false"`, else the
router option. `hover` waits 65 ms on pointer or focus, `tap` fires on `pointerdown` (also for
hover links and touch), `viewport` and `load` use the activation scheduler. Requests send
`Purpose: prefetch` (`Sec-Purpose` cannot be set from `fetch`). The cache is per tab, keyed by URL
without hash, LRU `cacheSize`, TTL `cacheTtl`, single use, emptied when an action ends. The parsed
page's `modulepreload` and stylesheet URLs are hinted ahead. Save-Data or 2G keeps only `tap`. Pages
without the router get a `<script type="speculationrules">` for their `data-prefetch` links
(`hover` → moderate, `tap` → conservative, `viewport` → eager, `load` → immediate; links in
`[data-surface-reload]` excluded); engine pages on browsers without Speculation Rules add
`<link rel="prefetch">` for `viewport`/`load` links.
