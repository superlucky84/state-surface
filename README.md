<p align="center">
  <h1 align="center">StateSurface</h1>
  <p align="center">
    <strong>Server owns state. Client owns DOM. Pages stream.</strong>
  </p>
</p>

<p align="center">
  <a href="https://github.com/superlucky84/state-surface/actions/workflows/ci.yml"><img src="https://github.com/superlucky84/state-surface/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/state-surface"><img src="https://img.shields.io/npm/v/state-surface.svg" alt="npm"></a>
  <a href="https://github.com/superlucky84/state-surface/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/state-surface.svg" alt="license"></a>
</p>

---

StateSurface is a **state-layout mapping runtime** for the web. Pages load as real MPA HTML. In-page updates stream through `<h-state>` anchors via NDJSON — no SPA router, no client-side state management, no virtual DOM diffing on your side.

```
User action → POST /transition/:name → Server yields state frames
            → NDJSON stream → Client frame queue → DOM projection
```

## Why StateSurface?

| Traditional SPA                                | StateSurface                                         |
| ---------------------------------------------- | ---------------------------------------------------- |
| Client fetches data, manages state, renders UI | Server streams state, client projects DOM            |
| Full-page JS bundle, hydration cost            | Per-anchor hydration, minimal client JS              |
| Complex state sync (Redux, Zustand, ...)       | No client state — server is the source of truth      |
| Router + layout + data loading                 | File-based routes, declarative layout slots          |
| Loading spinners everywhere                    | Progressive streaming with partial/accumulate frames |

## Quick Start

```bash
npx create-state-surface my-app
cd my-app
pnpm install
pnpm dev
```

Open `http://localhost:3000` — full SSR, streaming transitions, and live action binding out of the box.

## The Four Concepts

StateSurface has exactly four concepts. That's the whole model.

### 1. Surface — The page

A page is an async function in `routes/**/*.tsx` that returns the whole document as JSX. Its body
runs on the server for every request. `<Slot>` marks a named update boundary that transitions target;
everything outside slots is plain server markup that never changes during the visit.

```tsx
// routes/dashboard.tsx → GET /dashboard
import type { SurfaceContext } from 'state-surface/server';
import { Boot, Slot } from 'state-surface';
import Layout from '../layouts/Layout';
import StockPrice from './dashboard/_components/StockPrice';
import StockNews from './dashboard/_components/StockNews';

export default async function Page(ctx: SurfaceContext) {
  const symbol = ctx.url.searchParams.get('symbol') ?? 'AAPL';
  return (
    <Layout title="Stock Dashboard">
      <main class="mx-auto max-w-6xl p-6">
        <h1 class="mb-6 text-2xl font-bold">Stock Dashboard</h1>
        <Slot name="stock:price">
          <StockPrice symbol={symbol} price={0} change={0} loading />
        </Slot>
        {/* An empty slot declares its component and is filled by the first frame. */}
        <Slot name="stock:news" component={StockNews} data-animate="fade" />
        <Boot transition="dashboard-load" params={{ symbol }} />
      </main>
    </Layout>
  );
}
```

- A `<Slot>` has exactly one child component element. **Its props are the slot state**: transitions
  send the same shape in `states: { 'stock:price': { … } }`.
- Layouts are ordinary synchronous components that render `<html>`, `<head>` and `<body>`. The engine
  adds the doctype, comment markers, stylesheets, bootstrap JSON and the entry script.
- Files and folders starting with `_` are not pages, so helpers live next to pages in `_components/`.
- `<Boot>` starts a transition right after the page loads (here: streaming the real data).

### 2. Template — Pure projection

A slot component receives server data as props and returns JSX. No `useState`, no `useEffect`, no
fetch calls. Components render synchronously; await data in the page function.

```tsx
// routes/dashboard/_components/StockPrice.tsx
type Props = { symbol: string; price: number; change: number; loading?: boolean };

export default function StockPrice({ symbol, price, change }: Props) {
  return (
    <div class="rounded-lg border p-4">
      <h3 class="font-bold">{symbol}</h3>
      <p class="text-2xl">${price}</p>
      <span class={change >= 0 ? 'text-green-600' : 'text-red-600'}>
        {change >= 0 ? '+' : ''}
        {change}%
      </span>
    </div>
  );
}
```

Server-only data steps use `defineServerComponent({ load, render })` from `state-surface/server` as
the child of `<Slot mode="server">`; the engine awaits every `load` of the page in parallel before
rendering. Independent client islands use directives such as `<LikeButton client:idle />`.

### 3. Transition — Server-side state generator

An async generator that yields state frames. Each `yield` sends one NDJSON line to the client, updating the UI progressively.

```typescript
// routes/dashboard/transitions/loadDashboard.ts
import { defineTransition } from 'state-surface/server';

export default defineTransition('dashboard-load', async function* (params, ctx) {
  // First frame: full state — renders loading skeleton
  yield {
    type: 'state',
    states: {
      'stock:price': { symbol: 'AAPL', price: 0, change: 0, loading: true },
      'stock:news': { items: [], loading: true },
      'stock:chart': { data: [], loading: true },
    },
  };

  // Partial frame: update only price slot
  const price = await fetchPrice('AAPL');
  yield {
    type: 'state',
    full: false,
    changed: ['stock:price'],
    states: { 'stock:price': price },
  };

  // More partial frames as data arrives...
});
```

### 4. Action — Declarative trigger

Trigger transitions from HTML attributes — zero JS event handlers.

```html
<button data-action="search" data-params='{"query":"test"}'>Search</button>

<form data-action="update-shipping">
  <select name="method">
    <option value="express">Express</option>
  </select>
  <button type="submit">Update</button>
</form>
```

| Attribute              | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `data-action`          | Transition name to invoke                                 |
| `data-params`          | JSON params (optional)                                    |
| `data-pending-targets` | Anchor names to mark pending during transition (optional) |

## Frame Types

StateSurface streams three types of state frames:

**Full frame** — Replaces all active state. First frame in every stream must be full.

```json
{ "type": "state", "states": { "slot:a": { "title": "Hello" }, "slot:b": { "items": [1, 2, 3] } } }
```

**Partial frame** — Updates or removes specific slots without touching others.

```json
{
  "type": "state",
  "full": false,
  "changed": ["slot:a"],
  "states": { "slot:a": { "title": "Updated" } }
}
```

**Accumulate frame** — Appends data into existing slots (arrays concat, strings concat, objects merge). Perfect for streaming chat, logs, or progressive content.

```json
{ "type": "state", "accumulate": true, "states": { "chat:current": { "text": " world" } } }
```

## Features

- **Full SSR** — Every page renders complete HTML on the server
- **NDJSON streaming** — Progressive UI updates via full, partial, and accumulate frames
- **Abort previous** — Concurrent transitions auto-cancel earlier ones
- **Per-slot hydration** — Reuses SSR DOM from snapshot props, no full-page rehydration
- **File-based routing** — `.tsx` pages and transitions auto-discovered from `routes/`
- **View Transition API** — MPA cross-fade + in-page element morphing
- **Animation presets** — 8 CSS animations via `data-animate` (`fade`, `slide-up`, `scale`, `blur`, ...)
- **i18n ready** — Bilingual content driven by cookie + transition
- **Sub-path mounting** — `BASE_PATH=/demo pnpm dev`

## Project Structure

```
routes/                  # Pages (routes/**/*.tsx, auto-loaded)
  index.tsx              #   GET /
  guide/[slug].tsx       #   Dynamic params: GET /guide/:slug
  <route>/_components/   #   Slot components (not pages: `_` prefix)
  <route>/transitions/   #   Server-side state generators
  _shared/               #   Cross-route components & transitions

layouts/                 # Layout components (Layout.tsx)
shared/                  # Data helpers, i18n utilities
client/                  # Assets (styles.css, plugins/)

engine/                  # Framework core (do not edit)
  server/                #   Web-standard core, page renderer, transition handler
  client/                #   Browser bootstrap, hydration, frame queue
  build/                 #   Vite plugin: page discovery, call-site transform, diagnostics
  shared/                #   Protocol types, Slot/Boot markers
```

## Install & Update

**New project** — use the CLI scaffolding:

```bash
npx create-state-surface my-app
```

**Update existing project** — upgrade the runtime package:

```bash
pnpm up state-surface
pnpm test && pnpm build
```

> Do not re-run `create-state-surface` to update an existing app.
> For breaking releases, see [`MIGRATION.md`](./MIGRATION.md).

## Commands

```bash
pnpm dev                          # Dev server (Vite + shared server core)
pnpm build                        # Production build
pnpm start                        # Run production server
pnpm test                         # Run all tests (Vitest)
pnpm test path/to/file.test.ts    # Run a single test file
pnpm format                       # Format with Prettier

BASE_PATH=/demo pnpm dev          # Serve under /demo/ prefix
```

## Environment Variables

| Variable    | Default       | Description                               |
| ----------- | ------------- | ----------------------------------------- |
| `PORT`      | `3000`        | Server listen port                        |
| `BASE_PATH` | _(empty)_     | Mount app under a sub-path (e.g. `/demo`) |
| `NODE_ENV`  | `development` | `development` / `test` / `production`     |

## API Reference

```typescript
// Pages and shared helpers
import { Slot, Boot, prefixPath, getBasePath } from 'state-surface';

// Server
import {
  createHandler,
  defineServerComponent,
  defineTransition,
  sequence,
} from 'state-surface/server';
import { serve } from 'state-surface/adapters/node';

// Client runtime
import { createStateSurface } from 'state-surface/client';
```

```typescript
// Types
import type { SlotProps, BootProps, StateFrame } from 'state-surface';
import type {
  PageModule,
  SurfaceContext,
  TransitionHandler,
  Middleware,
} from 'state-surface/server';
import type { StateSurfacePlugin } from 'state-surface/client';
```

## Tech Stack

- **Server**: Node.js Web Request/Response core + [Vite](https://vite.dev/) middleware
- **Rendering**: [Lithent](https://github.com/superlucky84/lithent) (~4 KB VDOM diff engine)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) via `@tailwindcss/vite`
- **Transport**: NDJSON over HTTP POST
- **Testing**: [Vitest](https://vitest.dev/) + [Supertest](https://github.com/ladjs/supertest) + [happy-dom](https://github.com/nicedaycode/happy-dom)

## License

[MIT](LICENSE)

Server configuration, runtime adapters, cookies, middleware and validation commands are documented in
[`docs/server-adapters.md`](docs/server-adapters.md). The default server uses Node HTTP; Express is an optional peer for existing applications.
