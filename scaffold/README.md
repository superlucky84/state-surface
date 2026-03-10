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

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `BASE_PATH` | _(empty)_ | Mount app under a sub-path (e.g. `/demo`) |

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
routes/                  # Route modules (auto-loaded)
  index.ts               #   Page layout + config
  <route>/templates/     #   TSX projection components
  <route>/transitions/   #   Server-side state generators
  _shared/               #   Cross-route templates & transitions
layouts/                 # Page composition helpers
shared/                  # Data helpers, i18n utilities
client/                  # Assets (styles.css, plugins/)
```

## Update Runtime

Do not re-run scaffolding to update an existing app. Upgrade the runtime package instead:

```bash
pnpm up state-surface
pnpm test && pnpm build
```
