# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StateSurface is a **state-layout mapping runtime** — a reference implementation where the server owns state and the client owns DOM projection. It is **not** an SPA framework, component system, or template language.

- Page navigation is **MPA** (full page loads)
- In-page updates come from **NDJSON state streams** over HTTP POST
- `<h-state name="...">` custom elements are fixed DOM anchors and hydration boundaries
- State frames (full/partial) drive which templates are mounted and what data they render
- Concurrency policy: **abort previous** transition

## Document Reading Order

When context is needed, read in this order:
1. `DESIGN.md` — frozen core ideas, full architecture, frame model, runtime pseudocode
2. `PROTOCOL.md` — NDJSON frame contract (valid/invalid examples, precedence rules)
3. `IMPLEMENT.md` — phased implementation checklist with progress tracking
4. `BOOTSTRAP.md` — minimum folder layout and file creation order for first runnable skeleton

## Tech Stack

- **Runtime**: Node.js (latest stable), pnpm `10.13.1`
- **Server**: Express 5 with Vite middleware (dev mode)
- **Client rendering**: Lithent (lightweight ~4KB VDOM library, used only as a diffing engine)
- **Transport**: NDJSON over HTTP POST (`POST /transition/:name`, `application/x-ndjson`)
- **Testing**: Vitest + Supertest + happy-dom
- **Optional**: fp-pack for data-transform pipelines in `shared/` helpers

## Build & Dev Commands

```bash
pnpm install
pnpm dev                  # start dev server via tsx watch server/index.ts
pnpm build                # production build (Vite)
pnpm test                 # run all tests with Vitest
pnpm test -- -t "keyword" # run tests matching a keyword
pnpm format               # format with Prettier
pnpm format:check         # check formatting without writing
```

## Coding Conventions

- TypeScript-first, ESM (`"type": "module"`), JSX via `jsxImportSource: "lithent"`
- Prettier enforced: semicolons, single quotes, trailing commas (ES5), 100-column width, no parens on single arrow params
- Naming: `camelCase` for variables/functions, `PascalCase` for types/classes, `lowerCamelCase` for module filenames (e.g., `ssrRenderer.ts`)
- Tests use `*.test.ts` suffix and live alongside their modules (colocated)
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`)

## Folder Structure

```
server/              # Express server, SSR, transition endpoints
  index.ts           # Server entry — Express app, route registration, Vite middleware
  bootstrap.ts       # Auto-register transitions & templates from routes/ at startup
  routeScanner.ts    # File-based route discovery (routes/ → URL patterns)
  routeHandler.ts    # Per-route Express GET handler (SSR pipeline)
  initialStates.ts   # SSR initial state resolution (initial > transition > empty)
  ssr.ts             # SSR helpers (fillHState, buildStateScript, buildBootScript, sha256 hash)
  ssrRenderer.ts     # Template rendering for SSR
  transition.ts      # Transition registry & handler
  fsUtils.ts         # Shared filesystem utilities (listFiles, isModuleFile)
client/              # Browser runtime
  main.ts            # Client entry — bootstrap StateSurface, boot auto-run, wire controls
  runtime/
    stateSurface.ts  # Core: anchor discovery, hydration, transition streaming, frame queue
    lithentBridge.ts # Lithent VDOM integration (render/hydrate/update)
    devOverlay.ts    # Debug overlay UI (?debug=1)
  templates/
    registry.ts      # Global template registry
    auto.ts          # Auto-register route templates via glob import
shared/              # Protocol types, validators, NDJSON — used by both server & client
  protocol.ts        # StateFrame types, validation, applyFrame (full/partial merge)
  ndjson.ts          # NDJSON encode/decode with streaming chunk parser
  routeModule.ts     # RouteModule type contract (layout, transition, params, initial, boot)
  templateRegistry.ts
  templateCheck.ts
layouts/             # Shared surface composition helpers (string-based HTML builders)
  surface.ts         # stateSlots, joinSurface, baseSurface
routes/              # Route modules + page-specific templates/transitions (auto-loaded)
  index.ts           # GET / — home/article demo page
  search.ts          # GET /search — search page
  article/[id].ts    # GET /article/:id — article page (with boot auto-run)
  _shared/templates/ # Cross-route templates (pageHeader, systemError)
  article/           # transitions/ + templates/ for article pages
  search/            # transitions/ + templates/ for search pages
demo/                # Reference demo app + integration test suite
  layout.ts          # Demo HTML layout builder (legacy, used by demo tests)
  surface.ts         # Surface document composition helper
  *.test.ts          # Integration tests (SSR, hydration, flows, abort, full-stack)
skills/              # AI agent skill docs (lithent, fp-pack) — not runtime code
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
- **Template registry**: Static map of state name → component module, shared by SSR and CSR.
- **Hydration**: Per `<h-state>` root (not full-page). SSR hash (sha256) enables mismatch fallback to client render.

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

`server/bootstrap.ts` scans `routes/**/transitions/*.ts` and `routes/**/templates/*.tsx` at startup, auto-registering all found handlers and templates. On the client, `client/templates/auto.ts` uses glob import to do the same. New routes just need the right file path to be discovered.

## Reference Projects

Two sibling projects serve as implementation references:

### `../lithent` — Lithent library source

Key internals: SSR via `renderToString`/`hydration` from `lithent/ssr`, render with `isHydration` flag, JSX runtime compatible with `jsxImportSource: "lithent"`. Vite plugin `@lithent/lithent-vite` handles automatic JSX transform. See `skills/lithent/SKILL.md` for full API reference.

### `../blog` — Vite + Lithent SSR prototype

Working SSR blog app demonstrating: Vite as Express middleware (dev), `renderToString` for SSR, `hydration` for client hydrate, `globalThis.pagedata` for server→client data passing. For StateSurface, `tsx watch` replaces the chokidar-based dev watcher.

## Library Usage Notes

### Lithent

Used as a DOM diff/patch engine only — no component API exposed to users. Key imports:
- `render`, `h` from `lithent`
- `renderToString`, `hydration` from `lithent/ssr`
- JSX automatic transform via `jsxImportSource: "lithent"` in tsconfig
- See `skills/lithent/SKILL.md` for full API reference

### fp-pack (optional)

- Prefer in `shared/` frame operation helpers (normalize, merge, precedence, apply)
- Keep SSR/hydration boundary code explicit — avoid over-abstracted chains
- Use `pipe`/`pipeAsync` for 2+ steps; call functions directly for single steps
- See `skills/fp-pack/SKILL.md` for rules and patterns
