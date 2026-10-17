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

StateSurface is a **state-layout mapping runtime** for the web. Pages are real MPA HTML (an opt-in router swaps that server HTML between pages). In-page updates stream through `<h-state>` anchors via NDJSON — no client-side state management, no virtual DOM diffing on your side.

```
User action → POST /transition/:name → Server yields state frames → request reducer
            → server slots render HTML, client slots get props → NDJSON patch ops → DOM
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
        <Slot name="stock:price" mode="server">
          <StockPrice symbol={symbol} price={0} change={0} loading />
        </Slot>
        {/* An empty slot declares its component and is filled by the first frame. */}
        <Slot name="stock:news" mode="server" component={StockNews} data-animate="fade" />
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
- **Modes**: a Slot without directives is `static` (server HTML only, frames cannot change it);
  `mode="server"` renders on the server and transitions update it with server-rendered HTML
  (`swap="replace"` by default, `swap="morph"` keeps inputs and focus); `client:load`,
  `client:idle`, `client:visible`, `client:media` and `client:only` make it a client slot that
  Lithent hydrates when its chunk loads and that receives props (or `merge` deltas).
- Client components activate at their timing or at once on the first `pointerdown`, `focusin` or
  `keydown` inside them; text typed before activation survives hydration. Their local state
  survives props updates; `resetKey="articleId"` (or a transition's `reset: ['slot']`) remounts them.
- `<Slot mode="server" server:defer fallback={…}>` renders the fallback first and fetches the
  content after load with an encrypted props token (`SURFACE_SECRET`).
- **Per-page JavaScript**: every client component is its own chunk. A page without client
  components, `data-action`, `<Boot>` or plugins ships no engine script at all; the action runtime
  and Lithent load only on pages that need them.

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
Modules that must never reach the browser `import 'state-surface/server-only'` or are named
`*.server.ts`; the build fails with the import chain if a client component reaches one.

Browser-only enhancements are client plugins declared per page (or layout):

```ts
// client/plugins/chatScroll.ts
import { definePlugin } from 'state-surface/client';

export const chatScroll = definePlugin({
  name: 'chat-scroll',
  slots: ['chat:messages'],
  load: 'load', // 'load' | 'idle' (default) | 'visible'
  attach(el) {
    el.scrollTop = el.scrollHeight;
  },
  update(el) {
    el.scrollTop = el.scrollHeight;
  },
});

// routes/[lang]/examples/chat.tsx
export const plugins = [chatScroll];
```

### 3. Transition — Server-side state generator

An async generator that yields state frames (or an async function that returns one result). The
server reduces each frame for this request and sends per-slot ops: HTML for server slots, props or
`merge` deltas for client slots. The engine sends `done` when the handler returns; throw to fail
(`TransitionError` messages are shown in the error slot).

Transitions live in `transitions/**/*.ts`; the file path is the name (`transitions/dashboard-load.ts`
→ `"dashboard-load"`, `transitions/comment/add.ts` → `"comment/add"`, kebab-case segments).

```typescript
// transitions/dashboard-load.ts
import { defineTransition } from 'state-surface/server';

export default defineTransition({
  // Slots this transition may change: actions with disjoint targets run in parallel.
  targets: ['stock:price', 'stock:news', 'stock:chart'],
  async *handler(params, ctx) {
    // First frame: full state for the transition's targets — renders loading skeletons
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

    // More partial frames as data arrives... no `done`: the engine sends it.
  },
});
```

**Typed input and JS-less forms** — declare a [Standard Schema](https://standardschema.dev) (zod,
valibot, arktype, …) as `input`. Invalid input never runs the handler and ends with
`{ kind: 'validation', fieldErrors }`. Form bodies (urlencoded or multipart) become objects first.

```typescript
// transitions/comment/add.ts
export default defineTransition({
  input: z.object({ postId: z.string(), body: z.string().min(1) }),
  targets: ['comments:list'],
  flash: { input: ['body'] }, // echo these fields back after a JS-less validation error
  async *handler({ postId, body }, ctx) {
    await db.addComment(postId, body);
    yield { type: 'state', states: { 'comments:list': { items: await db.comments(postId) } } };
  },
});
```

```tsx
// Works without JavaScript: 303 back to the page, the result in ctx.flash('comment/add').
// With JavaScript the engine runs the same transition as a stream instead.
<form method="post" action={actionUrl('comment/add')}>
  <textarea name="body" />
</form>
```

The build writes `.state-surface/actions.d.ts`, so `useAction(renew, 'comment/add')`, `<Boot>` and
`actionUrl()` check names and params against the schema.

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

Anchors keep `data-pending` until their request ends and get `data-has-result` once its first
result is shown. A component that calls `preventDefault()` keeps the event; one event runs one action.

From a client component, `useAction` runs the same runtime and re-renders with its state:

```tsx
import { mount } from 'lithent';
import { useAction } from 'state-surface/client';

const LikeButton = mount(renew => {
  const like = useAction(renew, 'like'); // { run, abort, pending, hasResult, error, aborted }
  return () => (
    <button disabled={like.pending} onClick={() => like.run({ delta: 1 })}>
      {like.error ? like.error.kind : 'Like'}
    </button>
  );
});
```

`run()` never throws: it resolves to `{ ok: true }`, `{ ok: false, error }` (`error.kind`: `server`,
`validation`, `timeout`, `http`, `network`, `protocol`, `chunk`) or `{ ok: false, aborted: true }`.

## Frame Types

StateSurface streams three types of state frames:

These are the frames a transition yields (the authoring layer, see [PROTOCOL.md](PROTOCOL.md)).

**Full frame** — Replaces the state of the transition's target slots. First frame in every stream
must be full.

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

## Client Navigation (opt-in)

Put `<ClientRouter />` in the layout head and links between those pages fetch the next page's HTML
and swap the engine-managed regions — no document load, no client routes. Pages without it never
load the router chunk.

```tsx
<head>
  <title>{title}</title>
  <ClientRouter prefetch="hover" />
</head>
<body>
  <iframe src="/map" transition:persist="map" />            {/* stays loaded across pages */}
  <Player client:load transition:persist="player" />        {/* keeps its local state */}
  <a href="/docs" data-prefetch="viewport">Docs</a>
  <a href="/logout" data-surface-reload>Log out</a>          {/* always a document load */}
</body>
```

- Same-origin links and GET forms navigate; actions, POST forms, `target`, `download`, modifier
  keys and hash links stay with the browser. Other builds, router-less pages and network failures
  fall back to a document load.
- `surface:before-preparation` (cancelable) → `after-preparation` → `before-swap` → `after-swap` →
  `page-load` events on `document`; `navigate(url)` from `state-surface/client`.
- Head nodes the engine did not render (tag managers) and body nodes outside the markers are kept;
  `<ClientRouter dataLayer />` pushes `surface.page_view` on every page.
- Prefetch `hover` (default) · `tap` · `viewport` · `load` · `false`, a 20-entry 30 s cache emptied
  after actions; Save-Data keeps only `tap`. See [PROTOCOL.md](PROTOCOL.md#client-router).

## Static Pages, Languages and Content

Pages that don't depend on the request are built once; content lives in files, validated at build
time; images are resized by the build.

```tsx
// routes/[lang]/guide/[slug].tsx → /en/guide/intro, /ko/guide/intro (prerendered)
import { getCollection, getEntry } from 'state-surface/content';
import { Image } from 'state-surface';
import cover from './_assets/cover.png';

export const prerender = true;
export const getStaticPaths = async () =>
  (await getCollection('guides')).map(entry => ({ lang: entry.lang!, slug: entry.id }));

export default async function Page(ctx: SurfaceContext) {
  const guide = (await getEntry('guides', ctx.params.slug, { lang: ctx.i18n!.lang }))!;
  return (
    <Layout title={guide.data.title}>
      <Image src={cover} alt="" width={960} priority />
      <guide.Content />
      <a href={ctx.i18n!.switchHref('ko')}>한국어</a>
    </Layout>
  );
}
```

- **Prerender** — `export const prerender = true` writes `dist/client/<path>/index.html`; the
  server still runs middleware before answering with it (ETag/304), and request-only APIs fail the
  build at the line that used them. A static host can serve `dist/client` alone.
- **Language paths** — `surface({ i18n: { locales, defaultLocale } })` serves `routes/[lang]/…` as
  `/en/…`, `/ko/…`; a path without a language redirects (cookie → `Accept-Language` → default),
  `?lang=` links switch and remember, hreflang links are written for you.
- **Content collections** — `content/config.ts` declares `defineCollection({ schema, i18n })`;
  `.md` uses `:::directive` blocks (10 guide blocks, raw HTML blocked), `.mdx` can host islands,
  `.json`/`.yaml` hold page texts. Schema and parity errors point at `file:line`. Code is
  highlighted on the server.
- **Images** — `<Image>` (WebP `srcset`), `<Picture formats={['avif', 'webp']}>` and `getImage()`
  write `width`/`height`, lazy loading and LCP preloads; remote hosts need `images.remotePatterns`.

See [docs/server-adapters.md](docs/server-adapters.md#prerendered-pages) for serving and static
hosting.

## Features

- **Full SSR** — Every page renders complete HTML on the server
- **NDJSON streaming** — Progressive UI updates via full, partial, and accumulate frames, projected
  by the server into HTML (server slots) and props (client slots)
- **Capabilities** — strict by default (no raw HTML, safe URLs), `rich` Markdown, opt-in `unsafe`
- **Target-aware concurrency** — A new action aborts the same action and actions whose targets
  overlap; disjoint targets run in parallel, `mode: 'queue'` runs one name in order
- **Per-slot hydration** — Reuses SSR DOM from snapshot props, no full-page rehydration
- **File-based routing** — `.tsx` pages from `routes/`, transitions from `transitions/` (path = name)
- **Progressive forms** — `actionUrl()` forms work without JavaScript (PRG + signed one-time flash)
- **Opt-in client router** — `<ClientRouter />` swaps server HTML between pages, keeps
  `transition:persist` iframes, media and islands, prefetches on hover
- **View Transition API** — page cross-fade (MPA or router); in-page transitions are opt-in per action
  (`viewTransition: true`, `data-view-transition`) or slot (`<Slot viewTransition>`)
- **Animation presets** — 8 CSS animations via `data-animate` (`fade`, `slide-up`, `scale`, `blur`, ...)
- **Static pages** — Prerendered pages per language, content collections, optimized images
- **Sub-path mounting** — `BASE_PATH=/demo pnpm dev`

## Project Structure

```
routes/                  # Pages (routes/**/*.tsx, auto-loaded)
  [lang]/index.tsx       #   GET /en, /ko (language paths, surface({ i18n }))
  [lang]/guide/[slug].tsx #  Dynamic params: GET /en/guide/:slug
  <route>/_components/   #   Slot components (not pages: `_` prefix)
  _shared/               #   Cross-route components

transitions/             # Server-side state generators (path = name: comment/add.ts → "comment/add")

layouts/                 # Layout components (Layout.tsx)
content/                 # Content collections (config.ts, guides/<lang>/*.md, pages/<lang>/*.yaml)
shared/                  # Data helpers, i18n utilities
client/                  # styles.css, plugins/, optional entry.ts (runs on every page)

engine/                  # Framework core (do not edit)
  server/                #   Web-standard core, page renderer, transition handler
  client/                #   Loader, component host, patch apply pipeline, morph
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

| Variable              | Default       | Description                               |
| --------------------- | ------------- | ----------------------------------------- |
| `PORT`                | `3000`        | Server listen port                        |
| `BASE_PATH`           | _(empty)_     | Mount app under a sub-path (e.g. `/demo`) |
| `NODE_ENV`            | `development` | `development` / `test` / `production`     |
| `SURFACE_IMAGE_CACHE` | _(temp dir)_  | Disk cache of `/_surface/image` resizes   |

## API Reference

```typescript
// Pages and shared helpers
import { Slot, Boot, ClientRouter, prefixPath, getBasePath, actionUrl } from 'state-surface';
import { Image, Picture, getImage } from 'state-surface';

// Content collections (server only)
import { defineCollection, getCollection, getEntry, highlight } from 'state-surface/content';

// Server
import {
  createHandler,
  defineServerComponent,
  defineTransition,
  TransitionError,
  sequence,
} from 'state-surface/server';
import { serve } from 'state-surface/adapters/node';

// Client plugins and component actions (the engine entry itself is generated)
import { definePlugin, useAction, navigate } from 'state-surface/client';
```

```typescript
// Types
import type { SlotProps, BootProps, StateFrame, ActionName, ActionParams } from 'state-surface';
import type {
  PageModule,
  SurfaceContext,
  TransitionHandler,
  Flash,
  Middleware,
} from 'state-surface/server';
import type {
  PluginDefinition,
  ActionHandle,
  ActionResult,
  NavigationDetail,
} from 'state-surface/client';
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
