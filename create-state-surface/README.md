# create-state-surface

Scaffold a new [StateSurface](https://github.com/superlucky84/state-surface) project.

## Usage

```bash
npx create-state-surface my-app            # minimal starter, asks for the server runtime
npx create-state-surface my-app --template demo --adapter node
cd my-app
pnpm install
pnpm dev                                   # http://localhost:3000
```

## Templates

| Template            | What you get                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `minimal` (default) | One page with static markup, a server slot (`home:greeting`, with a CSS Module), a client island and one transition; a Vitest test for both. |
| `demo`              | The showcase site: guides from content collections, examples (streaming, actions, chat, search, View Transitions, UI patches), i18n paths.   |

```
my-app/                      # minimal
  routes/index.tsx           # the page: static markup + <Slot mode="server"> + client:visible island
  routes/_components/        # Greeting.tsx (+ Greeting.module.css), Counter.tsx
  transitions/greet.ts       # data-action="greet" → new state for home:greeting
  layouts/Layout.tsx         # document shell, system:error slot, <ClientRouter />
  client/styles.css          # Tailwind entry
  tests/home.test.ts         # page and transition through the request handler
  server.ts                  # server entry of the chosen adapter
  vite.config.ts             # surface({ adapter }) + Tailwind
```

## Options

| Option                  | Description                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `<project-name>`        | Directory of the new project (letters, numbers, `-`, `_`)                          |
| `--template`, `-t`      | `minimal` (default) or `demo`                                                      |
| `--adapter`, `-a`       | `node` (default), `express`, `bun`, `deno` or `cloudflare`; asked when omitted     |
| `--source <dir>`        | Use the templates of a local state-surface checkout instead of downloading them    |
| `--no-git`              | Skip `git init`                                                                    |
| `STATE_SURFACE_VERSION` | Environment: the `state-surface` dependency (default `^0.1.0`; `file:` paths work) |

The adapter sets `server.ts`, the adapter in `vite.config.ts` and the `start` script (Bun, Deno),
adds `express` for Express, and `wrangler.jsonc` with `deploy` for Cloudflare Workers.

## How it works

Templates live in the StateSurface repository under `create-state-surface/templates/`
(`base/`, `minimal/`, `demo/`, `adapters/<name>/`); the demo template uses the repository's own
showcase files. The CLI downloads the repository tarball (or reads `--source`), copies the base,
template and adapter files, fills in `package.json` and initializes git. CI creates the apps,
installs the packed engine, builds, tests and starts them (`pnpm test:scaffold`).

## After scaffolding

```bash
pnpm dev            # dev server with HMR
pnpm check          # build analysis + tsc, no bundle
pnpm test           # Vitest
pnpm build          # production build
pnpm start          # production server
```

The CLI is for new projects only. Update an existing app with `pnpm up state-surface`.

## Requirements

- Node.js >= 20
- pnpm (recommended) or npm

## License

[MIT](https://github.com/superlucky84/state-surface/blob/main/LICENSE)
