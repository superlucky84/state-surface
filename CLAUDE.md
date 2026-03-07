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

1. `DESIGN.md` — frozen core ideas, full architecture, frame model, runtime pseudocode
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
  server/
    index.ts         # Express app assembly, route registration, transition endpoint, dev middleware
    bootstrap.ts     # Auto-register transitions & templates from routes/ at startup
    routeScanner.ts  # File-based route discovery (routes/ → URL patterns)
    routeHandler.ts  # Per-route Express GET handler (SSR pipeline)
    initialStates.ts # SSR initial state resolution (initial > transition > empty)
    ssr.ts           # SSR helpers (fillHState, buildStateScript, buildBootScript, sha256 hash)
    ssrRenderer.ts   # Template rendering for SSR
    transition.ts    # Transition registry & handler
    fsUtils.ts       # Shared filesystem utilities (listFiles, isModuleFile)
  client/
    main.ts          # Browser bootstrap (StateSurface init, action binding, Prism highlight)
    stateSurface.ts  # Core: anchor discovery, hydration, transition streaming, frame queue
    actionDelegation.ts  # Declarative action binding (data-action click/submit delegation)
    lithentBridge.ts # Lithent VDOM integration (render/hydrate/update)
    devOverlay.ts    # Debug overlay UI (?debug=1)
    templates/
      auto.ts        # Auto-register route templates via glob import
      registry.ts    # Template registry re-export
  shared/
    basePath.ts      # Central basePath management (setBasePath, getBasePath, prefixPath)
    protocol.ts      # StateFrame types, validation, applyFrame (full/partial merge)
    ndjson.ts        # NDJSON encode/decode with streaming chunk parser
    routeModule.ts   # RouteModule type contract (layout, transition, params, initial, boot)
    templateRegistry.ts
    templateCheck.ts
client/              # User assets
  styles.css         # Tailwind CSS entry point (imported by surface HTML)
shared/              # User data helpers
  content.ts         # Bilingual content data (ko/en) for all pages
  i18n.ts            # i18n helpers (getLang from cookie, lang cookie path)
layouts/             # Shared surface composition helpers (string-based HTML builders)
  surface.ts         # stateSlots, joinSurface, surfaceDocument, baseSurface
routes/              # Route modules + page-specific templates/transitions (auto-loaded)
  index.ts           # GET / — home page (hero, concepts, features)
  guide/[slug].ts    # GET /guide/:slug — guides (quickstart + 5 concept guides)
  examples/index.ts  # GET /examples — examples landing page
  examples/streaming.ts        # GET /examples/streaming — frame flow visualization
  examples/actions.ts          # GET /examples/actions — action playground
  examples/view-transition.ts  # GET /examples/view-transition — View Transition API morphing
  examples/search.ts           # GET /examples/search — feature/concept search
  examples/chat.ts             # GET /examples/chat — chatbot (streaming + abort)
  _shared/templates/ # Cross-route templates (pageHeader, systemError)
  _shared/transitions/   # Cross-route transitions (switchLang)
  <route>/templates/ # Per-route TSX projection components
  <route>/transitions/   # Per-route server-side state generators
skills/              # (removed — previously held lithent/fp-pack reference docs)
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

| Concept        | What                                              | Where                                      |
| -------------- | ------------------------------------------------- | ------------------------------------------ |
| **Surface**    | Page shell with `<h-state>` anchors (string HTML) | `routes/*.ts` layout, `layouts/`           |
| **Template**   | Projection component inside each anchor (TSX)     | `routes/**/templates/*.tsx`                |
| **Transition** | Server-side state generator (async generator)     | `routes/**/transitions/*.ts`               |
| **Action**     | Declarative trigger binding (HTML attributes)     | `data-action` + `data-params` in templates |

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

### Route Auto-Registration

`engine/server/bootstrap.ts` scans `routes/**/transitions/*.ts` and `routes/**/templates/*.tsx` at startup, auto-registering all found handlers and templates. On the client, `client/templates/auto.ts` uses glob import to do the same. New routes just need the right file path to be discovered.

### i18n (Korean / English)

- All pages support bilingual content (ko/en) driven by `lang` cookie
- Language switch is a transition (`data-action="switch-lang"`) — server yields full frame in target language
- `shared/content.ts` holds `{ ko, en }` content; server sends only the selected language's data
- `shared/i18n.ts` provides `getLang(req)` helper (reads cookie, defaults to `en`)
- `initial(req)` reads the cookie at SSR time for correct initial language rendering

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
| `/examples`                   | `examples:list`                                                | Examples landing page with links to all demos                  |
| `/examples/streaming`         | `demo:controls`, `demo:timeline`, `demo:output`              | Full/partial frames, `removed`, error frame                    |
| `/examples/actions`           | `actions:playground`, `actions:log`                          | `data-action`, form submit, scoped pending                     |
| `/examples/view-transition`   | `vt:description`, `vt:gallery`                               | View Transition API, `view-transition-name` morphing           |
| `/examples/search`            | `search:input`, `search:results`                             | Form `data-action`, pending state                              |
| `/examples/chat`              | `chat:messages`, `chat:input`, `chat:typing`, `chat:current` | Abort previous, progressive streaming, cacheUpdate             |

All pages share `page:header` and `system:error` via `baseSurface`.

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
- Block renderers in `routes/guide/[slug]/templates/guideContent.tsx`
- TOC with section anchor jump links in `routes/guide/[slug]/templates/guideToc.tsx`

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
