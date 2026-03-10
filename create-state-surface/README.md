# create-state-surface

Scaffold a new [StateSurface](https://github.com/superlucky84/state-surface) project in seconds.

## Usage

```bash
npx create-state-surface my-app
cd my-app
pnpm install
pnpm dev
```

Open `http://localhost:3000` — your app is running with full SSR, NDJSON streaming, and live action binding.

## What You Get

The generated project comes with a complete working app:

```
my-app/
  server.ts                # Express + Vite dev server entry
  routes/
    index.ts               # Home page (hero, concepts, features)
    guide/[slug].ts        # Dynamic guide pages with TOC
    examples/
      streaming.ts         # Full/partial/accumulate frame demo
      actions.ts           # Declarative action playground
      chat.ts              # Streaming chatbot with abort
      search.ts            # Form submission + pending state
      view-transition.ts   # View Transition API morphing
      ui-patch.ts          # CSS class/variable patching
    _shared/               # Cross-route templates & transitions
  layouts/                 # Page composition helpers
  shared/                  # Data helpers, i18n utilities
  client/                  # Tailwind CSS entry + plugins
  tsconfig.json
  vite.config.ts
  vitest.config.ts
```

Every route includes its own `templates/` (TSX) and `transitions/` (async generators) — all auto-registered by the framework.

## Options

```bash
npx create-state-surface <project-name>
npx create-state-surface --help
```

| Argument | Description |
|---|---|
| `<project-name>` | Directory name for the new project (required) |

Project names must start with a letter or number and may include letters, numbers, `-`, or `_`.

## What Happens Under the Hood

1. Downloads the latest scaffold template from the StateSurface repository
2. Substitutes project name and runtime version into `package.json`
3. Renames dotfiles (`.gitignore`, `.npmrc`)
4. Initializes a git repository

No global dependencies. No configuration prompts. One command, ready to develop.

## After Scaffolding

```bash
pnpm dev                   # Start dev server with HMR
pnpm build                 # Production build
pnpm start                 # Run production server
pnpm test                  # Run tests (Vitest)
pnpm format                # Format with Prettier
```

## Updating the Runtime

The CLI is for **new projects only**. To update an existing project's framework runtime:

```bash
pnpm up state-surface
pnpm test && pnpm build
```

Do not re-run `create-state-surface` on an existing project — it will not overwrite, and your customizations live in user-space files that the runtime upgrade respects.

## Requirements

- Node.js >= 20
- pnpm (recommended) or npm

## License

[MIT](https://github.com/superlucky84/state-surface/blob/main/LICENSE)
