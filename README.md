# StateSurface

A **state-layout mapping runtime** for MPA pages with NDJSON streaming updates.

The server owns state. The client owns DOM projection. Pages load as real HTML; in-page updates stream through `<h-state>` anchors — no SPA router, no client-side state management.

## Frame Flow

```
User action
  → POST /transition/:name          (declarative data-action trigger)
  → Server async generator yields    (StateFrame objects)
  → NDJSON stream over HTTP          (one JSON line per frame)
  → Client frame queue               (FIFO, 33ms budget per flush)
  → DOM update per <h-state>         (Lithent VDOM diff/patch)
```

## Quick Start

```bash
npx create-state-surface my-app
cd my-app
pnpm install
pnpm dev
```

Open `http://localhost:3000` — the app runs with SSR, streaming transitions, and live action binding out of the box.

## Core Concepts

| Concept | What | File location |
|---------|------|---------------|
| **Surface** | Page shell with `<h-state>` anchors (HTML string) | `routes/*.ts` layout |
| **Template** | Projection component inside each anchor (TSX) | `routes/**/templates/*.tsx` |
| **Transition** | Server-side async generator yielding state frames | `routes/**/transitions/*.ts` |
| **Action** | Declarative trigger binding via HTML attributes | `data-action` in templates |

### Surface

Define a page layout mixing static HTML with dynamic slots. The surface never changes during a page visit — only the content inside each `<h-state>` updates.

```typescript
// routes/dashboard.ts
import type { RouteModule } from 'state-surface';
import { baseSurface, joinSurface, stateSlots } from '../layouts/surface.js';

export default {
  layout: stateScript => baseSurface(joinSurface(
    '<main class="max-w-6xl mx-auto p-6">',
    '  <h1 class="text-2xl font-bold mb-6">Stock Dashboard</h1>',
    '  <div class="grid grid-cols-3 gap-4 mb-8">',
           stateSlots('stock:price', 'stock:news', 'stock:chart'),
    '  </div>',
    '  <h2 class="text-lg font-semibold mb-3">Market Analysis</h2>',
           stateSlots('stock:analysis'),
    '</main>',
  ), stateScript),
} satisfies RouteModule;
```

### Template

A pure function that receives server data and returns JSX. No `useState`, no `useEffect`, no fetch.

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

### Transition

An async generator that yields state frames. Each `yield` = one NDJSON line = one UI update.

```typescript
// routes/dashboard/transitions/loadDashboard.ts
import { defineTransition } from 'state-surface';

export default defineTransition('dashboard-load', async function* (_params, _req) {
  yield {
    type: 'state',
    states: {
      'stock:price': { symbol: 'AAPL', price: 0, change: 0, loading: true },
      'stock:news': { items: [], loading: true },
      'stock:chart': { data: [], loading: true },
    },
  };

  const price = await fetchPrice('AAPL');
  yield {
    type: 'state',
    full: false,
    changed: ['stock:price'],
    states: { 'stock:price': price },
  };
});
```

### Action

Trigger transitions from HTML attributes — no JS event handlers needed.

```html
<button data-action="search" data-params='{"query":"test"}'>Search</button>

<form data-action="update-shipping">
  <select name="method">
    <option value="express">Express</option>
  </select>
  <button type="submit">Update</button>
</form>
```

- `data-action` — transition name to invoke
- `data-params` — JSON params (optional)
- `data-pending-targets` — comma-separated anchor names to mark pending (optional)

## Features

- **Full SSR** — every page renders complete HTML on the server
- **NDJSON streaming** — progressive UI updates via state frames (full, partial, accumulate)
- **Abort previous** — concurrent transitions auto-cancel earlier ones
- **Accumulate frames** — append/concat data into existing slots (arrays, strings, objects)
- **Per-anchor hydration** — SHA256 hash mismatch triggers client-side fallback, not full-page rehydration
- **i18n** — bilingual (ko/en) content driven by `lang` cookie
- **View Transition API** — MPA cross-fade + in-page element morphing via `view-transition-name`
- **Animation presets** — 8 opt-in CSS animations via `data-animate` attribute (`fade`, `slide-up`, `scale`, `blur`, etc.)
- **Sub-path mounting** — `BASE_PATH=/demo pnpm dev` serves under any prefix
- **File-based routing** — routes, templates, and transitions auto-discovered from `routes/` directory

## Project Structure

```
engine/                  # Framework core (do not edit)
  server/                #   Express routes, SSR, transition handler
  client/                #   Browser bootstrap, hydration, frame queue
  shared/                #   Protocol types, template registry, basePath

routes/                  # Your route modules + templates + transitions
  index.ts               #   GET / — home page
  search.ts              #   GET /search
  chat.ts                #   GET /chat (streaming + abort)
  guide/[slug].ts        #   GET /guide/:slug (dynamic param)
  features/              #   Feature showcase pages
  _shared/               #   Cross-route templates & transitions
  <route>/templates/     #   Per-route TSX projection components
  <route>/transitions/   #   Per-route server-side state generators

layouts/                 # Page composition helpers (HTML string builders)
shared/                  # Data helpers, i18n utilities
client/                  # User assets (styles.css)
```

## Commands

```bash
pnpm dev                          # Start dev server (tsx watch + Vite middleware)
pnpm build                        # Production build (Vite)
pnpm test                         # Run all tests (Vitest)
pnpm test path/to/file.test.ts    # Run a single test file
pnpm format                       # Format with Prettier
pnpm format:check                 # Check formatting

BASE_PATH=/demo pnpm dev          # Serve under /demo/ prefix
```

## API Reference

All public exports are available from `'state-surface'`:

```typescript
import {
  defineTemplate,       // Register a template component for an anchor name
  defineTransition,     // Register a transition handler
  prefixPath,           // Prepend BASE_PATH to a URL
  getBasePath,          // Get the current BASE_PATH value
} from 'state-surface';

import type {
  RouteModule,          // Route module contract (layout, transition, initial, boot)
  BootConfig,           // Boot transition config
  StateFrame,           // NDJSON state frame type
  TemplateModule,       // Template module shape
  TransitionHandler,    // Transition async generator type
} from 'state-surface';
```

## Tech Stack

- **Server**: Express 5 + Vite middleware (dev)
- **Rendering**: [Lithent](https://github.com/user/lithent) (~4KB VDOM diffing engine)
- **Styling**: Tailwind CSS via `@tailwindcss/vite`
- **Transport**: NDJSON over HTTP POST
- **Testing**: Vitest + Supertest + happy-dom

## License

[MIT](LICENSE)
