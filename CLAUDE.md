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
- **Server**: Express
- **Client rendering**: Lithent (lightweight ~4KB VDOM library, used only as a diffing engine)
- **Transport**: NDJSON over HTTP POST (`POST /transition/:name`, `application/x-ndjson`)
- **Optional**: fp-pack for data-transform pipelines in `shared/` helpers

## Build & Dev Commands

```bash
pnpm install
pnpm dev      # start dev server/client
pnpm build    # production build
pnpm test     # run tests
```

## Target Folder Structure

```
server/          # Express server, SSR, transition endpoints
client/          # Runtime, templates, hydration
  runtime/       # StateSurface client core (anchor discovery, frame queue, apply)
  templates/     # Static template registry (name → module)
shared/          # Protocol types, frame validator, NDJSON encode/decode
skills/          # AI agent skill docs (lithent, fp-pack) — not runtime code
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

## Reference Projects

Two sibling projects serve as implementation references:

### `../lithent` — Lithent library source

The actual Lithent library. Key internals to know:

- **SSR** (`lithent/ssr`):
  - `renderToString(wDom)` — recursively converts WDom to HTML string. Skips events, keys, refs. Handles `innerHTML` prop, self-closing tags, style objects.
  - `hydration(wDom, wrapElement)` — attaches existing DOM elements to WDom tree (`addElement`), then calls `render(wDom, wrapElement, null, true)` to bind events without re-creating DOM.
  - Hydration walks real DOM children and WDom children in parallel, matching by tag name and node type. Fragment/loop types (`f`/`l`) are flattened.

- **Render** (`lithent/src/render.ts`):
  - `render(wDom, wrapElement, afterElement?, isHydration?)` — when `isHydration=true`, skips DOM creation, only attaches events via `updateProps`. Returns a cleanup function.
  - Internal update dispatch uses `nr` (needRerender) flags: `A`(add), `D`(delete), `R`(replace), `U`(update), `S`(sorted-replace), `T`(sorted-update), `L`(loop-update).

- **JSX runtime** (`lithent/jsx-runtime`):
  - Exports `jsx`, `jsxs`, `jsxDEV` (all alias `createWNode`) and `Fragment`.
  - Compatible with `jsxImportSource: "lithent"` in tsconfig.

- **Vite plugin** (`../lithent/packages/lithentVite`):
  - `@lithent/lithent-vite` — sets `esbuild.jsx: 'automatic'` + `jsxImportSource: 'lithent'`, handles HMR boundary injection. Install as devDependency.

### `../blog` — Vite + Lithent SSR prototype

Working SSR blog app. Key patterns to replicate:

- **Dev server** (`server.js`):
  ```js
  // Vite as middleware in Express (dev only)
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    server: { middlewareMode: 'ssr', hmr: true },
  });
  // ... mount routes ...
  app.use(vite.middlewares);  // Vite middleware AFTER app routes
  ```

- **SSR rendering** (`serverHelper/makePage.js`):
  ```js
  import { h } from 'lithent';
  import { renderToString } from 'lithent/ssr';
  // Server renders full HTML from Layout component
  let pageString = renderToString(h(Layout, { page: Page, ...props }));
  return `<!DOCTYPE html>${pageString}`;
  ```

- **Module loading**:
  - Dev: `vite.ssrLoadModule('@/layout')` — hot-reloads modules
  - Prod: `import(path.resolve(__dirname, distPath))` — pre-built modules

- **Client hydration** (`src/base/load.ts`):
  ```ts
  import { h } from 'lithent';
  import { hydration } from 'lithent/ssr';
  const LayoutWDom = h(Layout, props);
  hydration(LayoutWDom, document.documentElement);
  ```

- **Data passing**: Server sets `globalThis.pagedata`, injects loader script via `</body>` replacement. Client reads data at hydration time.

- **tsconfig JSX**: Uses `"jsx": "preserve"` with `"jsxFactory": "h"` + `"jsxFragmentFactory": "Fragment"`. The `@lithent/lithent-vite` plugin handles automatic JSX transform via esbuild.

- **Dev watcher** (`watch-serve.js`): Uses chokidar to restart Express on server.js / src file changes. **For StateSurface**, `tsx watch` replaces this.

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
