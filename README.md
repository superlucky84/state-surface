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

| Traditional SPA | StateSurface |
|---|---|
| Client fetches data, manages state, renders UI | Server streams state, client projects DOM |
| Full-page JS bundle, hydration cost | Per-anchor hydration, minimal client JS |
| Complex state sync (Redux, Zustand, ...) | No client state — server is the source of truth |
| Router + layout + data loading | File-based routes, declarative layout slots |
| Loading spinners everywhere | Progressive streaming with partial/accumulate frames |

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

### 1. Surface — The page shell

A surface is static HTML with `<h-state>` anchor slots. It never changes during a page visit — only the content inside each slot updates.

```typescript
// routes/dashboard.ts
import type { RouteModule } from 'state-surface';
import { baseSurface, joinSurface, stateSlots } from '../layouts/surface.js';

export default {
  layout: stateScript =>
    baseSurface(
      joinSurface(
        '<main class="max-w-6xl mx-auto p-6">',
        '  <h1 class="text-2xl font-bold mb-6">Stock Dashboard</h1>',
        '  <div class="grid grid-cols-3 gap-4">',
        stateSlots('stock:price', 'stock:news', 'stock:chart'),
        '  </div>',
        stateSlots('stock:analysis'),
        '</main>'
      ),
      stateScript
    ),
} satisfies RouteModule;
```

### 2. Template — Pure projection

A template receives server data and returns JSX. No `useState`, no `useEffect`, no fetch calls.

```tsx
// routes/dashboard/templates/stockPrice.tsx
import { defineTemplate } from 'state-surface';

const StockPrice = ({ symbol, price, change }: Props) => (
  <div class="rounded-lg border p-4">
    <h3 class="font-bold">{symbol}</h3>
    <p class="text-2xl">${price}</p>
    <span class={change >= 0 ? 'text-green-600' : 'text-red-600'}>
      {change >= 0 ? '+' : ''}{change}%
    </span>
  </div>
);

export default defineTemplate('stock:price', StockPrice);
```

### 3. Transition — Server-side state generator

An async generator that yields state frames. Each `yield` sends one NDJSON line to the client, updating the UI progressively.

```typescript
// routes/dashboard/transitions/loadDashboard.ts
import { defineTransition } from 'state-surface/server';

export default defineTransition('dashboard-load', async function* (_params, _req) {
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

| Attribute | Purpose |
|---|---|
| `data-action` | Transition name to invoke |
| `data-params` | JSON params (optional) |
| `data-pending-targets` | Anchor names to mark pending during transition (optional) |

## Frame Types

StateSurface streams three types of state frames:

**Full frame** — Replaces all active state. First frame in every stream must be full.

```json
{"type":"state","states":{"slot:a":{"title":"Hello"},"slot:b":{"items":[1,2,3]}}}
```

**Partial frame** — Updates or removes specific slots without touching others.

```json
{"type":"state","full":false,"changed":["slot:a"],"states":{"slot:a":{"title":"Updated"}}}
```

**Accumulate frame** — Appends data into existing slots (arrays concat, strings concat, objects merge). Perfect for streaming chat, logs, or progressive content.

```json
{"type":"state","accumulate":true,"states":{"chat:current":{"text":" world"}}}
```

## Features

- **Full SSR** — Every page renders complete HTML on the server
- **NDJSON streaming** — Progressive UI updates via full, partial, and accumulate frames
- **Abort previous** — Concurrent transitions auto-cancel earlier ones
- **Per-anchor hydration** — SHA256 hash check, no full-page rehydration
- **File-based routing** — Routes, templates, and transitions auto-discovered from `routes/`
- **View Transition API** — MPA cross-fade + in-page element morphing
- **Animation presets** — 8 CSS animations via `data-animate` (`fade`, `slide-up`, `scale`, `blur`, ...)
- **i18n ready** — Bilingual content driven by cookie + transition
- **Sub-path mounting** — `BASE_PATH=/demo pnpm dev`

## Project Structure

```
routes/                  # Your route modules (auto-loaded)
  index.ts               #   GET / — page layout + config
  guide/[slug].ts        #   Dynamic params: GET /guide/:slug
  <route>/templates/     #   TSX projection components
  <route>/transitions/   #   Server-side state generators
  _shared/               #   Cross-route templates & transitions

layouts/                 # Page composition helpers
shared/                  # Data helpers, i18n utilities
client/                  # Assets (styles.css, plugins/)

engine/                  # Framework core (do not edit)
  server/                #   Express routes, SSR, transition handler
  client/                #   Browser bootstrap, hydration, frame queue
  shared/                #   Protocol types, template registry
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
pnpm dev                          # Dev server (tsx watch + Vite HMR)
pnpm build                        # Production build
pnpm start                        # Run production server
pnpm test                         # Run all tests (Vitest)
pnpm test path/to/file.test.ts    # Run a single test file
pnpm format                       # Format with Prettier

BASE_PATH=/demo pnpm dev          # Serve under /demo/ prefix
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `BASE_PATH` | _(empty)_ | Mount app under a sub-path (e.g. `/demo`) |
| `NODE_ENV` | `development` | `development` / `test` / `production` |

## API Reference

```typescript
// Client + shared
import { defineTemplate, prefixPath, getBasePath } from 'state-surface';

// Server
import { createApp, defineTransition } from 'state-surface/server';

// Client runtime
import { createStateSurface } from 'state-surface/client';
```

```typescript
// Types
import type { RouteModule, StateFrame, BootConfig, TemplateModule } from 'state-surface';
import type { TransitionHandler, TransitionHooks } from 'state-surface/server';
import type { StateSurfacePlugin } from 'state-surface/client';
```

## Tech Stack

- **Server**: [Express 5](https://expressjs.com/) + [Vite](https://vite.dev/) middleware
- **Rendering**: [Lithent](https://github.com/superlucky84/lithent) (~4 KB VDOM diff engine)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) via `@tailwindcss/vite`
- **Transport**: NDJSON over HTTP POST
- **Testing**: [Vitest](https://vitest.dev/) + [Supertest](https://github.com/ladjs/supertest) + [happy-dom](https://github.com/nicedaycode/happy-dom)

## License

[MIT](LICENSE)
