# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StateSurface is a **state-layout mapping runtime** — a production-ready framework where the server owns state and the client owns DOM projection. It is **not** an SPA framework, component system, or template language.

- Page navigation is **MPA** (full page loads)
- In-page updates come from **NDJSON state streams** over HTTP POST
- `<h-state name="...">` custom elements are fixed DOM anchors and hydration boundaries
- State frames (full/partial) drive which templates are mounted and what data they render
- Concurrency policy: **abort previous** transition

## Document Reading Order

When context is needed, read in this order:

1. `docs/ui-protocol/DESIGN.md` — active UI protocol design (ui/uiChanged, capability model)
2. `PROTOCOL.md` — NDJSON frame contract (valid/invalid examples, precedence rules)
3. `NEXT_IDEA.md` — next-step architecture direction and expansion notes
4. `docs/completed/DESIGN.md` — archived core design (Phase 1 baseline)
5. `docs/completed/DESIGN_PHASE2.md` — archived production architecture decisions
6. `docs/completed/IMPLEMENT.md` — archived Phase 1 implementation checklist
7. `docs/completed/IMPLEMENT_PHASE2.md` — archived Phase 2 implementation checklist

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
  server.ts          # 'state-surface/server': createHandler, defineTransition, defineServerComponent, types
  vite.ts            # 'state-surface/vite': surface() plugin (manifest/islands virtual modules, transform, dev SSR)
  build/
    analyze.ts       # oxc-parser module analysis (Slot/directive/Boot usage, imports, server components)
    app.ts           # Page import-graph analysis, componentIds, cross-module diagnostics
    transform.ts     # Call-site transform: islands and Slot children → Island descriptors
    routeScanner.ts  # Page discovery: routes/**/*.tsx except `_` files/folders, URL collisions
    diagnostics.ts   # SurfaceBuildError with file:line:column and code frame
  server/
    core/            # Web Request→Response handler, SurfaceContext, middleware, manifest
    ssrRenderer.ts   # Page pipeline: await page → collect slots → parallel server load → render → document assembly
    serverComponent.ts # defineServerComponent({ load, render })
    ssr.ts           # Bootstrap JSON builders (__STATE__, __BOOT__, __BASE_PATH__)
    transition.ts    # Transition registry & handler
  client/
    main.ts          # Browser bootstrap (componentId registry, islands, <Boot> entries, action binding)
    stateSurface.ts  # Core: anchor discovery, hydration, transition streaming, frame queue
    lithentBridge.ts # Lithent VDOM integration (resolves components by data-component)
    islands.ts       # Direct directive islands (<h-island>) hydration
    actionDelegation.ts  # Declarative action binding (data-action click/submit delegation)
    devOverlay.ts    # Debug overlay UI (?debug=1)
  shared/
    surfaceTree.ts   # Slot / Boot / Island markers, slot name rules, JSON checks, JSX types
    basePath.ts      # Central basePath management (setBasePath, getBasePath, prefixPath)
    protocol.ts      # StateFrame types, validation, applyFrame (full/partial merge)
    ndjson.ts        # NDJSON encode/decode with streaming chunk parser
    routeModule.ts   # PageModule contract (default page function, prerender, getStaticPaths, plugins)
client/              # User assets
  main.ts            # Engine entry (createStateSurface with plugins)
  styles.css         # Tailwind CSS entry point (linked by the engine)
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
User action → POST /transition/:name → server generator yields StateFrames
→ NDJSON stream → client frame queue → apply loop → DOM update per <h-state>
```

### Key Concepts

- **`activeStates`**: A `Record<string, any>` map of template name → bound data. Full frames replace it; partial frames merge into it.
- **Full frame**: `full !== false` — declares complete UI state, replaces `activeStates` entirely. First frame in every stream must be full.
- **Partial frame**: `full === false` — must include `changed` and/or `removed`. Apply `removed` first, then merge `changed` via `states`.
- **Accumulate frame**: `accumulate === true` — stacks delta data into existing slot state (arrays concat, strings concat, objects shallow-merge, scalars replace). Never resets a slot; use a full frame for reset.
- **Template registry**: Static map of state name → component module, shared by SSR and CSR.
- **Hydration**: Per `<h-state>` root (not full-page). SSR hash (sha256) enables mismatch fallback to client render.

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

### Frame Queue Rules

- Frames processed FIFO, one flush per animation frame (33ms budget)
- Consecutive partial frames coalesce (last write wins)
- Full frames supersede any pending partials
- `done` flushes remaining queue; `error` with matching anchor renders as full state

### Protocol Invariants (from PROTOCOL.md)

- `type` and `states` required on state frames
- `full` defaults to `true`
- `full:false` requires at least one of `changed`/`removed`
- `changed` keys must exist in `states`; `removed` keys must NOT exist in `states`
- A key cannot appear in both `changed` and `removed`

### Pages, Slots and the Build Plugin

- A page is `export default async function Page(ctx: SurfaceContext)` returning JSX with `<html>`, `<head>`, `<body>`
  (usually through `layouts/Layout.tsx`). Named exports `prerender`, `getStaticPaths`, `plugins` are page options.
- `<Slot name="ns:name">` wraps exactly one statically imported component element; that element's props are the
  slot state that transitions update. `<Slot name component={X} />` declares an initially empty slot.
  Host attributes (`class`, `style`, `id`, `data-*`, `aria-*`) are written on the `<h-state>` element.
- `mode="server"` slots render on the server only; `defineServerComponent({ load, render })` children have their
  `load` awaited in parallel. Until mode normalization (IMPLEMENT stage 3) a Slot without `mode` behaves as today:
  SSR + hydration from `__STATE__` + client updates.
- Direct islands `<C client:idle />` render as `<h-island>` with JSON `data-props`; children are a static fragment.
- `<Boot transition params />` records an auto-run transition in `__BOOT__` (array, document order).
- The Vite plugin (`enforce: 'pre'`) transforms Slot children/islands into `Island` descriptors so Lithent does not
  run them at JSX time, and reports diagnostics with `file:line:column`. `engine/build/` discovers pages
  (`routes/**/*.tsx` minus `_` files/folders) and transitions (`routes/**/transitions/*.ts`), and generates
  `virtual:state-surface/manifest` (server) and `virtual:state-surface/islands` (componentId → client component).
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
- Client reads `<script id="__BASE_PATH__">` injected during SSR
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
| `/examples/view-transition` | `vt:description`, `vt:gallery`                               | View Transition API, `view-transition-name` morphing           |
| `/examples/search`          | `search:input`, `search:results`                             | Form `data-action`, pending state                              |
| `/examples/chat`            | `chat:messages`, `chat:input`, `chat:typing`, `chat:current` | Abort previous, progressive streaming, cacheUpdate             |

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
- In-page slot updates: `sync()` wraps DOM changes with `document.startViewTransition()` (progressive enhancement)
- `activeStates` updates synchronously outside the callback to prevent accumulate frame race conditions
- Users can add `view-transition-name` in templates for element morphing — no engine changes needed
