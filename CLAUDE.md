# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StateSurface is a **state-layout mapping runtime** — a production-ready framework where the server owns state and the client owns DOM projection. It is **not** an SPA framework, component system, or template language.

- Page navigation is **MPA** (full page loads)
- In-page updates come from **NDJSON streams** over HTTP POST: transitions yield state frames, the server
  reduces them per request and sends per-slot ops (server slots get HTML, client slots get props)
- `<h-state name="...">` custom elements are fixed DOM anchors and hydration boundaries
- Concurrency policy: a new action aborts the same action and actions whose **targets** overlap;
  disjoint targets run in parallel, transitions without targets overlap everything, `mode: 'queue'`
  runs one name in order

## Document Reading Order

When context is needed, read in this order:

1. `docs/surface-expansion/` — StateSurface 2.0 plan (REQUIREMENTS → DESIGN → IMPLEMENT → MANUAL_TEST_CHECKLIST)
2. `PROTOCOL.md` — two-layer contract: authoring frames → transport ops, bootstrap, deferred slots
3. `NEXT_IDEA.md` — next-step architecture direction and expansion notes
4. `docs/ui-protocol/DESIGN.md` — superseded single-layer UI protocol (kept as history)
5. `docs/completed/DESIGN.md` — archived core design (Phase 1 baseline)
6. `docs/completed/DESIGN_PHASE2.md` — archived production architecture decisions
7. `docs/completed/IMPLEMENT.md` — archived Phase 1 implementation checklist
8. `docs/completed/IMPLEMENT_PHASE2.md` — archived Phase 2 implementation checklist

## Tech Stack

- **Runtime**: Node.js (latest stable), pnpm `10.13.1`
- **Server**: Express 5 with Vite middleware (dev mode)
- **Client rendering**: Lithent (lightweight ~4KB VDOM library, used only as a diffing engine)
- **Styling**: Tailwind CSS (utility-first, via `@tailwindcss/vite` plugin)
- **Transport**: NDJSON over HTTP POST (`POST /transition/:name`, `application/x-ndjson`)
- **Testing**: Vitest + Supertest + happy-dom
- **Optional**: fp-pack for data-transform pipelines in `shared/` helpers

## Build & Dev Commands

```bash
pnpm install
pnpm dev                          # start dev server via tsx watch server.ts
pnpm build                        # production build (Vite)
pnpm test                         # run all tests with Vitest
pnpm test path/to/file.test.ts    # run a single test file
pnpm test -- -t "keyword"         # run tests matching a keyword
pnpm format                       # format with Prettier
pnpm format:check                 # check formatting without writing
pnpm test:modes                   # stage 3 fixture: entry selection, lazy chunks, server-only build checks

# Sub-path mounting (basePath)
BASE_PATH=/demo pnpm dev          # serve under /demo/ prefix
```

## Coding Conventions

- TypeScript-first, ESM (`"type": "module"`), JSX via `jsxImportSource: "lithent"`
- Prettier enforced: semicolons, single quotes, trailing commas (ES5), 100-column width, no parens on single arrow params
- Naming: `camelCase` for variables/functions, `PascalCase` for types/classes, `lowerCamelCase` for module filenames (e.g., `ssrRenderer.ts`)
- Tests use `*.test.ts` suffix and live alongside their modules (colocated)
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`)

## Folder Structure

```
engine/              # Framework core — users should not edit these files
  index.ts           # 'state-surface': Slot, Boot, prefixPath, getBasePath, actionUrl, protocol types
  server.ts          # 'state-surface/server': createHandler, defineTransition, TransitionError, defineServerComponent
  client.ts          # 'state-surface/client': definePlugin, useAction, ActionError
  vite.ts            # 'state-surface/vite': surface() plugin (manifest with page manifests/buildId, islands, transform)
  rich.ts            # 'state-surface/rich': Markdown renderer for capability="rich" (mdast → hast allowlist)
  build/
    analyze.ts       # oxc-parser module analysis (Slot/directive/Boot usage, imports, server components)
    app.ts           # Page import-graph analysis, componentIds, page slot tables, cross-module diagnostics
    transform.ts     # Call-site transform: islands and Slot children → Island descriptors
    routeScanner.ts  # Page discovery: routes/**/*.tsx except `_` files/folders, URL collisions
    transitionScanner.ts # transitions/**/*.ts → names (path, kebab-case), .state-surface/actions.d.ts
    diagnostics.ts   # SurfaceBuildError with file:line:column and code frame
  server/
    core/            # Web Request→Response handler (pages, /transition, /_surface/island, /_surface/action), context, manifest
    ssrRenderer.ts   # Page pipeline + renderSlotHtml (html ops, deferred responses), capability enforcement
    projection.ts    # Request reducer and per-slot projection, targets, coalescing, limits, ctx.external
    transitionResponse.ts # Generator/async result → wire frames (engine-sent done, idle timeout, size limits)
    secrets.ts       # IC-09 HKDF keys, AES-GCM deferred slot tokens
    flash.ts         # Signed one-time flash cookie (PRG result), redirect target validation
    serverComponent.ts # defineServerComponent({ load, render })
    ssr.ts           # __SURFACE__ bootstrap JSON builder
    transition.ts    # defineTransition({ input, targets, mode, flash, viewTransition, handler } | handler), TransitionError
  client/
    loader.ts        # Engine entry chunk (only on pages that need the engine) → start.ts
    start.ts         # Reads bootstrap, schedules components/plugins, loads the runtime, captures early actions,
                     #   chunk failure → build check → reload on next interaction
    scheduler.ts     # Activation timing: load / idle / visible / media
    componentHost.ts # Client slots & islands: lazy chunks (1 retry), activation on pointerdown/focusin/keydown,
                     #   hydrate/render/update, dormant latest props, reset/resetKey remount
    pluginHost.ts    # definePlugin, per-page plugin loading, attach/update/cleanup, onPage/onAction
    runtime.ts       # Action runtime chunk: StateSurface + SlotDom + delegation + <Boot> + deferred slots
    stateSurface.ts  # Action runtime: concurrent requests (targets/queue), per-request pending, results, apply pipeline
    actionError.ts   # ActionError (kind: server/validation/timeout/http/network/protocol/chunk), ActionResult
    useAction.ts     # useAction(renew, name) handle over the shared runtime (runtimeAccess.ts, no globals)
    slotDom.ts       # Server HTML swap (replace + focus/scroll restore, morph), remove, UI patches
    morph.ts         # idiomorph chunk (swap="morph" pages only), island boundaries (IC-06)
    lithentBridge.ts # Lithent chunk: mountComponent (DataProxy, hydrate/render, island children, keeps user input)
    actionEvents.ts  # data-action / actionUrl form event → invocation (defaultPrevented skip, one per event)
    actionDelegation.ts  # Declarative action binding (document click/submit delegation, bubble phase)
    devOverlay.ts    # Debug overlay UI (?debug=1)
  shared/
    surfaceTree.ts   # Slot / Boot / Island markers, slot name rules, JSON checks, JSX types
    actions.ts       # ActionName/ActionParams (global StateSurface.Actions), actionUrl, endpoint paths
    schema.ts        # Standard Schema types and validateSchema (field errors)
    basePath.ts      # Central basePath management (setBasePath, getBasePath, prefixPath)
    protocol.ts      # Authoring frames, transport ops, bootstrap types, validators, applyFrame reducer
    capability.ts    # URL scheme allowlist, script neutralization, rich marker
    ndjson.ts        # NDJSON encode/decode with streaming chunk parser
    routeModule.ts   # PageModule contract (default page function, prerender, getStaticPaths, plugins)
client/              # User assets
  styles.css         # Tailwind CSS entry point (linked by the engine)
  plugins/           # definePlugin() client plugins, declared per page with `export const plugins`
  entry.ts           # (optional) app entry run on every page before the engine
shared/              # User data helpers
  content.ts         # Bilingual content data (ko/en) for all pages
  i18n.ts            # i18n helpers (getLang(ctx) from cookie)
  schema.ts          # Demo Standard Schema builder (object/text/integer)
  *.server.ts        # Demo server stores (chat history, actions comments/likes)
transitions/         # Server-side state generators: path = name (comments/add.ts → "comments/add")
layouts/
  Layout.tsx         # Document shell with page:header and system:error slots
routes/              # Pages (routes/**/*.tsx) + page-specific components
  index.tsx          # GET / — home page (hero, concepts, features)
  guide/[slug].tsx   # GET /guide/:slug — guides (loading SSR + <Boot transition="guide-load">)
  examples/*.tsx     # GET /examples/... — demos (streaming, actions, view-transition, search, chat, ui-patch)
  _shared/components/    # Cross-route components (pageHeader, systemError)
  <route>/_components/   # Per-route slot components (`_` folders are not pages)
.state-surface/      # Generated (gitignored): actions.d.ts typing useAction/<Boot>/actionUrl
```

## Architecture

### Frame Flow

```
User action → POST /transition/:name (X-Surface-Build, X-Surface-Page)
→ transition yields StateFrames → request reducer → projection per slot mode
→ NDJSON { type:'patch', reset?, ops } … { type:'done' } → browser coalesces ops → DOM per <h-state>
```

### Key Concepts

- **Request state**: the server keeps slot state for one request only (starts empty, never trusts the client).
- **Full frame**: `full !== false` — replaces the transition's **targets** (declared `targets` or the first
  full frame's slots); missing targets are removed. First frame in every stream must be full.
- **Partial frame**: `full === false` — must include `changed`, `removed` and/or `uiChanged`.
- **Accumulate frame**: `accumulate === true` — deltas (arrays concat, strings concat, other values replace).
  Server slots re-render; client slots get `merge` ops.
- **No `done`/`error` yields**: the engine sends `done` when the handler returns; throw to fail
  (`TransitionError` messages reach the `system:error` slot in production).
- **Hydration**: per `<h-state>` root from `__SURFACE__` snapshot props (client slots only).

### Four User-Facing Concepts

| Concept        | What                                          | Where                                      |
| -------------- | --------------------------------------------- | ------------------------------------------ |
| **Surface**    | `.tsx` page function with `<Slot>` boundaries | `routes/**/*.tsx`, `layouts/Layout.tsx`    |
| **Template**   | Slot child component (TSX); its props = state | `routes/**/_components/*.tsx`              |
| **Transition** | Server-side state generator (async generator) | `transitions/**/*.ts`                      |
| **Action**     | Declarative trigger binding (HTML attributes) | `data-action` + `data-params` in templates |

### Action System (Declarative Binding)

Templates trigger transitions via HTML attributes — no imperative JS required:

```tsx
<button data-action="search" data-params='{"query":"test"}'>
  Search
</button>
```

- `data-action` — transition name to invoke
- `data-params` — JSON params (optional, defaults to `{}`)
- `data-pending-targets` — comma-separated anchor names to mark pending (optional; defaults to all anchors)
- Form submission: `<form data-action="...">` handles `submit` event automatically; the submitter's
  name/value and repeated fields are snapshotted at event time; forms with files go as multipart
- `<form method="post" action={actionUrl('name')}>` works without JS (PRG: 303 + one-time flash read
  by `ctx.flash('name')`); with JS the engine streams the same transition
- Engine uses delegated `click`/`submit` listeners on `document` (bubble phase) — a component's
  `preventDefault()` wins, one event runs one action
- Client components use `useAction(renew, 'name')` → `{ run, abort, pending, hasResult, error, aborted }`;
  `run()` never throws and resolves `{ ok }` / `{ ok: false, error }` / `{ ok: false, aborted: true }`

Pending state: each request marks its anchors (`data-pending-targets`, else its targets, else every slot)
with `data-pending` until it ends and `data-has-result` after its first result (CSS: `h-state[data-pending]`).

### Browser Apply Rules

- Request states: awaiting-baseline → (reset patch) active → completed/failed/aborted; `done` only = empty success;
  EOF without `done` is an error. Content op violations stop the request; invalid `ui` ops are skipped.
- Queued ops coalesce once per animation frame per request (last `html`/`props` per slot, `merge` folds, ops
  after `remove` are a new appearance); aborted requests' ops are dropped.
- Concurrency from `__SURFACE__.actions` (targets/queue): same name or overlapping targets abort the earlier
  request; undeclared targets overlap everything (dev warns once).
- `error` frames render their slot (`system:error`) regardless of targets; the next baseline clears it.
- In-page View Transitions are opt-in: `defineTransition({ viewTransition: true, … })`,
  `data-view-transition`, or `<Slot viewTransition>`; one per action, skipped for reduced motion.
- 409 (build mismatch) reloads the document.

### Protocol Invariants (from PROTOCOL.md)

- `type` and `states` required on state frames; `full` defaults to `true`
- `full:false` requires at least one of `changed`/`removed`/`uiChanged`
- `changed` keys must exist in `states`; `removed` keys must NOT exist in `states`; not both
- Ops must target slots in the transition targets and on the page; static slots cannot be updated
- Transitions with an `input` Standard Schema validate params first: invalid → 422 error frame
  `{ kind: 'validation', fieldErrors }`, handler not run. Form bodies become objects (repeated names → arrays)
- `reset: [slot]` remounts a client slot (`props` op `reset: true`); invalid for server/static slots
- UI tokens `[A-Za-z0-9_:/\[\].-]+`, `cssVars` keys `--*` without `;{}\`/`url(`/`expression(`

### Pages, Slots and the Build Plugin

- A page is `export default async function Page(ctx: SurfaceContext)` returning JSX with `<html>`, `<head>`, `<body>`
  (usually through `layouts/Layout.tsx`). Named exports `prerender`, `getStaticPaths`, `plugins` are page options.
- `<Slot name="ns:name">` wraps exactly one statically imported component element; that element's props are the
  slot state that transitions update. `<Slot name component={X} />` declares an initially empty slot.
  Host attributes (`class`, `style`, `id`, `data-*`, `aria-*`) are written on the `<h-state>` element.
- Mode normalization: no directive → `static` (SSR only, frames cannot change content, no JS); `client:*`
  directive → client slot (SSR + hydration from `__SURFACE__` props when its chunk loads, then `props`/`merge` ops);
  `client:only` skips SSR and shows `fallback`; `mode="server"` renders on the server and is updated with server
  HTML (`swap="replace"` default, `swap="morph"`); `defineServerComponent({ load, render })` children re-run `load`
  per render. `server:defer` renders the fallback and loads the content from `/_surface/island/:componentId`.
  The demo uses server slots everywhere except `chat:current` (client, token streaming via `merge`).
- Capability (DC-13): `strict` (default) forbids raw HTML and strips non-http(s)/mailto/relative URLs in slot
  content; `rich` allows `Markdown` from `state-surface/rich`; `unsafe` allows raw HTML with inert scripts and
  optional `sandbox="iframe"`. External agent frames enter only via `yield* ctx.external(source)` into
  `<Slot external schema={…}>` slots.
- Activation (DC-04/05): client components start at their timing or at once on `pointerdown`/`focusin`/`keydown`
  inside them (the event is not replayed; typed input, focus and selection survive hydration). Chunks retry once
  after 1 s; after that SSR stays and a different `X-Surface-Build` reloads on the next interaction. Dormant slots
  keep the latest props and hydrate the SSR snapshot first. `resetKey` (Slot prop) remounts on a new key value.
  Lithent hydration cannot fill an empty SSR text node later: render `null`, not `''`, for empty text.
- Entry selection: the engine loader script is written only when the page renders client components, `data-action`,
  `<Boot>`, deferred slots or plugins; `client:load` chunks, the action runtime and the morph chunk get
  `modulepreload`, rendered components' chunk CSS is linked. `client/entry.ts` (if present) runs on every page.
- Server-only code: `import 'state-surface/server-only'`, `*.server.ts(x)` and `node:*` reachable from a client
  component fail the client build with the import chain.
- One bootstrap `<script id="__SURFACE__">`: `{ buildId, pageId, basePath, slots, boot, plugins, actions }`. Direct islands
  `<C client:idle />` render as `<h-island data-island="$N">` (`<slot>$N` inside a slot) with their props in
  `slots`; children are a static fragment. `<Boot transition params />` records an auto-run transition in `boot`.
- The Vite plugin (`enforce: 'pre'`) transforms Slot children/islands into `Island` descriptors so Lithent does not
  run them at JSX time, and reports diagnostics with `file:line:column`. `engine/build/` discovers pages
  (`routes/**/*.tsx` minus `_` files/folders) and transitions (`transitions/**/*.ts`, writing
  `.state-surface/actions.d.ts`), and generates
  `virtual:state-surface/manifest` (server: per-page plugins and page manifests, buildId, build secret),
  `virtual:state-surface/islands`
  (componentId → lazy chunk loader) and `virtual:state-surface/plugins` (plugin id → lazy chunk loader).
- componentId = project-relative module path + `#` + export name (e.g. `routes/examples/chat/_components/chatInput.tsx#default`).

### i18n (Korean / English)

- All pages support bilingual content (ko/en) driven by `lang` cookie
- Language switch is a transition (`data-action="switch-lang"`) — server yields full frame in target language
- `shared/content.ts` holds `{ ko, en }` content; server sends only the selected language's data
- `shared/i18n.ts` provides `getLang(req)` helper (reads cookie, defaults to `en`)
- Page functions call `getLang(ctx)` at SSR time for correct initial language rendering

### Base Path (Sub-Path Mounting)

- `engine/shared/basePath.ts` — central `setBasePath()` / `getBasePath()` / `prefixPath()` helpers
- Set via `process.env.BASE_PATH` (e.g., `BASE_PATH=/demo pnpm dev`)
- Server applies prefix to Express routes and transition endpoint
- Client reads `basePath` from the `__SURFACE__` bootstrap JSON
- All template hrefs and navigation links use `prefixPath()` for correct URLs
- Zero-cost default: empty basePath behaves identically to no basePath

### Showcase Site Pages

| Route                       | Slots                                                                    | Features                                                                                  |
| --------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `/`                         | `page:hero`, `page:concepts`, `page:features`                            | `initial` SSR only, surface composition                                                   |
| `/guide/:slug`              | `guide:content`, `guide:toc`                                             | Dynamic `[param]`, boot auto-run, full→partial, 10 block types                            |
| `/examples`                 | `examples:list`                                                          | Examples landing page with links to all demos                                             |
| `/examples/streaming`       | `demo:controls`, `demo:timeline`, `demo:output`                          | Full/partial frames, `removed`, error frame                                               |
| `/examples/actions`         | `actions:playground`, `actions:log`, `actions:likes`, `actions:comments` | `data-action`, scoped pending, `useAction` island, typed + queue `like`, JS-less PRG form |
| `/examples/view-transition` | `vt:description`, `vt:gallery`                                           | Action-level View Transition, `view-transition-name` morphing                             |
| `/examples/search`          | `search:input`, `search:results`                                         | Form `data-action`, pending state, `swap="morph"` input                                   |
| `/examples/chat`            | `chat:messages`, `chat:input`, `chat:typing`, `chat:current`             | Abort previous, server history store, client `merge` streaming                            |

All pages share `page:header` and `system:error` via `layouts/Layout.tsx`.

## Reference Projects

Two sibling projects serve as implementation references:

### `../lithent` — Lithent library source

Key internals: SSR via `renderToString`/`hydration` from `lithent/ssr`, render with `isHydration` flag, JSX runtime compatible with `jsxImportSource: "lithent"`. Vite plugin `@lithent/lithent-vite` handles automatic JSX transform.

### `../blog` — Vite + Lithent SSR prototype

Working SSR blog app demonstrating: Vite as Express middleware (dev), `renderToString` for SSR, `hydration` for client hydrate, `globalThis.pagedata` for server→client data passing. For StateSurface, `tsx watch` replaces the chokidar-based dev watcher.

## Library Usage Notes

### Lithent

Used as a DOM diff/patch engine only — no component API exposed to users. Key imports:

- `render`, `h` from `lithent`
- `renderToString`, `hydration` from `lithent/ssr`
- `mount`, `cacheUpdate` from `lithent/helper` (used in chat for performance)
- JSX automatic transform via `jsxImportSource: "lithent"` in tsconfig

### Guide System

- 6 guides: `quickstart` + 5 concept guides (`surface`, `template`, `transition`, `action`, `accumulate`)
- 10 block types: `paragraph`, `bullets`, `code`, `checklist`, `warning`, `sequence`, `diagram`, `callout`, `analogy`, `debug`
- Bilingual (ko/en) with i18n parity enforced by tests (same section IDs, block counts, block types)
- Guide content in `shared/content.ts` → `GUIDE_DATA[lang][slug]`
- Block renderers in `routes/guide/_components/guideContent.tsx`
- TOC with section anchor jump links in `routes/guide/_components/guideToc.tsx`

### Animation Presets

8 opt-in presets via `data-animate` attribute on `<h-state>`:
`fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `scale`, `blur`, `flip`

Each preset includes reveal animation (entrance) and per-preset pending visual hint.
CSS-only — defined in `client/styles.css`.

### View Transition API

- MPA cross-fade: `@view-transition { navigation: auto; }` in `client/styles.css`
- In-page updates apply immediately by default (DC-06); opt in per action (`viewTransition: true` on
  `defineTransition`, sent as `X-Surface-View-Transition`, or `data-view-transition` on the action element) or
  per slot (`<Slot viewTransition>`, first appearance included). One transition per action, on its first patch;
  later patches apply immediately; reduced motion or no API → immediate
- Users add `view-transition-name` in templates for element morphing — no engine changes needed
