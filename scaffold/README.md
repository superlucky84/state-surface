# StateSurface App

Built with [StateSurface](https://github.com/superlucky84/state-surface) — server-driven state streaming for MPA pages.

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` to view the app.

## Configuration

Copy `.env.example` to `.env` and edit as needed (this is done automatically on project creation):

```bash
cp .env.example .env
```

Available variables:

| Variable              | Default      | Description                               |
| --------------------- | ------------ | ----------------------------------------- |
| `PORT`                | `3000`       | Server listen port                        |
| `BASE_PATH`           | _(empty)_    | Mount app under a sub-path (e.g. `/demo`) |
| `SURFACE_IMAGE_CACHE` | _(temp dir)_ | Disk cache for resized remote images      |

`.env` is loaded automatically by `pnpm dev` and `pnpm start` via Node.js `--env-file-if-exists`. No extra dependencies needed.

## Commands

```bash
pnpm dev            # Dev server with HMR
pnpm build          # Production build
pnpm start          # Run production server
pnpm test           # Run tests (Vitest)
pnpm format         # Format with Prettier
```

## Project Structure

```
server.ts                # App entry point
routes/                  # Pages: routes/**/*.tsx (auto-loaded; `_` files/folders are not pages)
  [lang]/index.tsx       #   export default async function Page(ctx) → JSX with <Slot> (/en, /ko)
  <route>/_components/   #   Slot components (props = slot state)
  _shared/               #   Cross-route components
transitions/             # Server-side state generators; path = name (comments/add.ts → "comments/add")
layouts/                 # Layout components (Layout.tsx)
content/                 # Content collections: config.ts, guides/<lang>/*.md, pages/<lang>/*.yaml
shared/                  # Data helpers, i18n utilities (pages.ts reads content/pages)
client/                  # Assets (styles.css, plugins/)
```

## Update Runtime

Do not re-run scaffolding to update an existing app. Upgrade the runtime package instead:

```bash
pnpm up state-surface
pnpm test && pnpm build
```

The default server imports the generated Vite manifest and uses
`serve({ manifest })` from `state-surface/adapters/node`. User routes and transitions
receive `SurfaceContext` (Web Request, URL, params, cookies, locals, env, signal).
Use ctx.cookies to read/write cookies; transition cookie writes must happen before
the first yield. `defineTransition({ input, targets, handler })` validates params with a
Standard Schema and declares the slots it changes (actions with disjoint targets run in
parallel). `<form method="post" action={actionUrl(name)}>` works without JavaScript; the page
reads the result with `ctx.flash(name)`. The build writes `.state-surface/actions.d.ts` so
`useAction(renew, name)` from `state-surface/client` is typed. `<ClientRouter />` in the layout head
turns links between its pages into client navigations (server HTML swap, `transition:persist`
elements and islands survive, hover prefetch); `data-surface-reload` opts a link out.
`export const prerender = true` builds a page into `dist/client/<path>/index.html` (still served after
the middleware); pages under `routes/[lang]/` answer `/en/…` and `/ko/…` (`surface({ i18n })` in
`vite.config.ts`, `ctx.i18n` in pages). `getCollection`/`getEntry` from `state-surface/content` read the
validated `content/` collections, and `<Image src={imported} alt width />` from `state-surface` writes
WebP `srcset`, `width`/`height` and lazy loading. Vite's surface plugin generates the registry for
development and production. To embed in Express, install the optional express peer and mount
`surface({ manifest })` before body-parsing middleware.
