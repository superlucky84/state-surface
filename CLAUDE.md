# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StateSurface is a **state-layout mapping runtime** — a production-ready framework where the server owns state and the client owns DOM projection. It is **not** an SPA framework, component system, or template language.

- Page navigation is **MPA** (full page loads)
- In-page updates come from **NDJSON streams** over HTTP POST: transitions yield state frames, the server
  reduces them per request and sends per-slot ops (server slots get HTML, client slots get props)
- `<h-state name="...">` custom elements are fixed DOM anchors and hydration boundaries
- Concurrency policy: **abort previous** transition (stage 5 narrows it by targets)

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
  index.ts           # 'state-surface': Slot, Boot, prefixPath, getBasePath, protocol types
  server.ts          # 'state-surface/server': createHandler, defineTransition, TransitionError, defineServerComponent
  vite.ts            # 'state-surface/vite': surface() plugin (manifest with page manifests/buildId, islands, transform)
  rich.ts            # 'state-surface/rich': Markdown renderer for capability="rich" (mdast → hast allowlist)
  build/
    analyze.ts       # oxc-parser module analysis (Slot/directive/Boot usage, imports, server components)
    app.ts           # Page import-graph analysis, componentIds, page slot tables, cross-module diagnostics
    transform.ts     # Call-site transform: islands and Slot children → Island descriptors
    routeScanner.ts  # Page discovery: routes/**/*.tsx except `_` files/folders, URL collisions
    diagnostics.ts   # SurfaceBuildError with file:line:column and code frame
  server/
    core/            # Web Request→Response handler (pages, /transition, /_surface/island), context, manifest
    ssrRenderer.ts   # Page pipeline + renderSlotHtml (html ops, deferred responses), capability enforcement
    projection.ts    # Request reducer and per-slot projection, targets, coalescing, limits, ctx.external
    transitionResponse.ts # Generator/async result → wire frames (engine-sent done, idle timeout, size limits)
    secrets.ts       # IC-09 HKDF keys, AES-GCM deferred slot tokens
    serverComponent.ts # defineServerComponent({ load, render })
    ssr.ts           # __SURFACE__ bootstrap JSON builder
    transition.ts    # defineTransition(name, handler | { targets, viewTransition, handler }), TransitionError
  client/
    loader.ts        # Engine entry chunk (only on pages that need the engine) → start.ts
    start.ts         # Reads bootstrap, schedules components/plugins, loads the runtime, captures early data-action
    scheduler.ts     # Activation timing: load / idle / visible / media
    componentHost.ts # Client slots & islands: lazy Lithent bridge + component chunks, hydrate/render/update
    pluginHost.ts    # definePlugin, per-page plugin loading, attach/update/cleanup, onPage/onAction
    runtime.ts       # Action runtime chunk: StateSurface + SlotDom + delegation + <Boot> + deferred slots
    stateSurface.ts  # Patch apply pipeline: request state table, op check, coalesce, generation, View Transitions
    slotDom.ts       # Server HTML swap (replace + focus/scroll restore, morph), remove, UI patches
    morph.ts         # idiomorph chunk (swap="morph" pages only), island boundaries (IC-06)
    lithentBridge.ts # Lithent chunk: mountComponent (DataProxy, hydrate/render, island children)
    actionEvents.ts  # data-action event → invocation (shared by loader capture and delegation)
    actionDelegation.ts  # Declarative action binding (data-action click/submit delegation)
    devOverlay.ts    # Debug overlay UI (?debug=1)
  shared/
    surfaceTree.ts   # Slot / Boot / Island markers, slot name rules, JSON checks, JSX types
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
layouts/
  Layout.tsx         # Document shell with page:header and system:error slots
routes/              # Pages (routes/**/*.tsx) + page-specific components/transitions
  index.tsx          # GET / — home page (hero, concepts, features)
  guide/[slug].tsx   # GET /guide/:slug — guides (loading SSR + <Boot transition="guide-load">)
  examples/*.tsx     # GET /examples/... — demos (streaming, actions, view-transition, search, chat, ui-patch)
  _shared/components/    # Cross-route components (pageHeader, systemError)
  _shared/transitions/   # Cross-route transitions (switchLang)
  <route>/_components/   # Per-route slot components (`_` folders are not pages)
  <route>/transitions/   # Per-route server-side state generators
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
| **Transition** | Server-side state generator (async generator) | `routes/**/transitions/*.ts`               |
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
- Form submission: `<form data-action="...">` handles `submit` event automatically
- Engine uses delegated `click`/`submit` listeners on `document` — no per-element binding

Pending state: engine adds `data-pending` attribute to target anchors during transition (CSS handles visual feedback via `h-state[data-pending]`).

### Browser Apply Rules

- Request states: awaiting-baseline → (reset patch) active → completed/failed/aborted; `done` only = empty success;
  EOF without `done` is an error. Content op violations stop the request; invalid `ui` ops are skipped.
- Queued ops coalesce once per animation frame (last `html`/`props` per slot, `merge` folds, ops after `remove`
  are a new appearance); a new transition invalidates the previous one (generation).
- `error` frames render their slot (`system:error`) regardless of targets; the next baseline clears it.
- In-page View Transitions are opt-in: `defineTransition(name, { viewTransition: true, … })`,
  `data-view-transition`, or `<Slot viewTransition>`; one per action, skipped for reduced motion.
- 409 (build mismatch) reloads the document.

### Protocol Invariants (from PROTOCOL.md)

- `type` and `states` required on state frames; `full` defaults to `true`
- `full:false` requires at least one of `changed`/`removed`/`uiChanged`
- `changed` keys must exist in `states`; `removed` keys must NOT exist in `states`; not both
- Ops must target slots in the transition targets and on the page; static slots cannot be updated
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
- Entry selection: the engine loader script is written only when the page renders client components, `data-action`,
  `<Boot>`, deferred slots or plugins; `client:load` chunks, the action runtime and the morph chunk get
  `modulepreload`, rendered components' chunk CSS is linked. `client/entry.ts` (if present) runs on every page.
- Server-only code: `import 'state-surface/server-only'`, `*.server.ts(x)` and `node:*` reachable from a client
  component fail the client build with the import chain.
- One bootstrap `<script id="__SURFACE__">`: `{ buildId, pageId, basePath, slots, boot, plugins }`. Direct islands
  `<C client:idle />` render as `<h-island data-island="$N">` (`<slot>$N` inside a slot) with their props in
  `slots`; children are a static fragment. `<Boot transition params />` records an auto-run transition in `boot`.
- The Vite plugin (`enforce: 'pre'`) transforms Slot children/islands into `Island` descriptors so Lithent does not
  run them at JSX time, and reports diagnostics with `file:line:column`. `engine/build/` discovers pages
  (`routes/**/*.tsx` minus `_` files/folders) and transitions (`routes/**/transitions/*.ts`), and generates
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

| Route                       | Slots                                                        | Features                                                       |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| `/`                         | `page:hero`, `page:concepts`, `page:features`                | `initial` SSR only, surface composition                        |
| `/guide/:slug`              | `guide:content`, `guide:toc`                                 | Dynamic `[param]`, boot auto-run, full→partial, 10 block types |
| `/examples`                 | `examples:list`                                              | Examples landing page with links to all demos                  |
| `/examples/streaming`       | `demo:controls`, `demo:timeline`, `demo:output`              | Full/partial frames, `removed`, error frame                    |
| `/examples/actions`         | `actions:playground`, `actions:log`                          | `data-action`, form submit, scoped pending                     |
| `/examples/view-transition` | `vt:description`, `vt:gallery`                               | Action-level View Transition, `view-transition-name` morphing  |
| `/examples/search`          | `search:input`, `search:results`                             | Form `data-action`, pending state, `swap="morph"` input        |
| `/examples/chat`            | `chat:messages`, `chat:input`, `chat:typing`, `chat:current` | Abort previous, server history store, client `merge` streaming |

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
