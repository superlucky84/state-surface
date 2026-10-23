# Repository Guidelines

## Project Structure & Module Organization

The runtime core lives in `engine/`:

- `engine/server/core/` for Web Request/Response routing, context, middleware, and streaming.
- `engine/adapters/` for Node, Express, Bun, Deno, and Cloudflare transports/static assets.
- `engine/build/` and `engine/vite.ts` for page discovery, the oxc call-site transform, diagnostics and generated manifests.
- `engine/server/projection.ts` and `transitionResponse.ts` for the request reducer and slot projection
  (authoring frames → per-slot `html`/`props`/`merge`/`remove`/`ui` ops).
- `engine/client/` for the browser runtime: loader (lazy component host `components.ts`, plugin host `pluginEntry.ts`
  behind `pluginRelay.ts`, early-action reader `actionEvents.ts`), component host (activation, retry, resetKey), action
  runtime (target-aware concurrency, per-request pending, `useAction`), patch apply pipeline, morph chunk,
  and the opt-in router chunk (`router.ts`: server HTML swap between `ss:head`/`ss:body` markers, persist,
  prefetch). Runtime pieces are split into document lifetime and page lifetime (`leavePage`/`mountPage`).
- `engine/server/flash.ts` and the `/_surface/action/<name>` endpoint for JS-less form submissions (PRG).
- Prerender and languages (DC-24): `engine/build/prerender.ts` (build-time render, `dist/client/<path>/index.html`),
  `engine/server/prerenderContext.ts` (restricted ctx), `engine/server/i18n.ts` (`routes/[lang]/`, redirects, hreflang).
- Content collections (DC-25): `engine/build/content.ts` (Markdown directives, data files, parity, diagnostics),
  `engine/build/mdx.ts`, `engine/content/` (renderers, server highlighting, query API) and `engine/content.ts`
  (`state-surface/content`).
- Images (DC-26): `engine/shared/image.ts` (`<Image>`, `<Picture>`, `getImage`), `engine/build/images.ts` (import →
  variants), `engine/images/service.ts` (sharp, disk cache) and `engine/server/core/imageEndpoint.ts`.
- `engine/shared/` for the two-layer protocol, NDJSON parsing, capability helpers, and shared contracts.
- `engine/hardening/` for the stage 9 suites (malicious input, seeded frame fuzz, races, parallel SSR, resources,
  limits); rerun one fuzz case with `FUZZ_SEED=<seed>`, widen with `FUZZ_SCALE=<n>`.

User/project code lives in `client/`, `content/`, `layouts/`, `routes/`, `transitions/`, and `shared/`. Pages are `routes/**/*.tsx`
(files and folders starting with `_` are not pages); slot components live in `_components/` next to pages. The demo pages
are under `routes/[lang]/` (`/en/…`, `/ko/…`); their texts are `content/pages/<lang>/*.yaml` (read through `shared/pages.ts`)
and the guides `content/guides/<lang>/*.md`, declared in `content/config.ts`. Transitions take the page language as a
`lang` param.
Transitions are `transitions/**/*.ts`; the path is the name (`transitions/comments/add.ts` → `"comments/add"`,
kebab-case segments). The build writes `.state-surface/actions.d.ts`, `content.d.ts`, `images.d.ts`, `styles.d.ts` and `pages.ts` (gitignored) to
type `useAction`/`<Boot>`/`actionUrl()`, collections and image imports.
Scaffolding CLI lives in `create-state-surface/` (`bin/`, `lib/create.js`). Templates are sources in `create-state-surface/templates/` (`base/`, `minimal/` starter, `demo/` built from the repository's showcase files at create time, `adapters/<name>/`); nothing is generated into the repository. `surface.server.ts` holds handler options (middleware, onError, limits) shared by `vite` dev and the production entry. The package ships `lib/` (tsc output); inside this repository the `state-surface-source` export condition resolves to `engine/*.ts`.
The StateSurface 2.0 plan is `docs/surface-expansion/` (REQUIREMENTS → DESIGN → IMPLEMENT → MANUAL_TEST_CHECKLIST). Other primary docs are `PROTOCOL.md` (two-layer contract), `NEXT_IDEA.md`, the superseded
`docs/ui-protocol/DESIGN.md`, and archive docs in `docs/completed/` (`DESIGN.md`, `DESIGN_PHASE2.md`, `IMPLEMENT.md`, `IMPLEMENT_PHASE2.md`).

## Build, Test, and Development Commands

Use Node.js (latest stable) with `pnpm@10.13.1`. Key commands:

- `pnpm dev` runs Vite and the shared web server core.
- `pnpm build` produces a production bundle with Vite.
- `pnpm start` runs the production server from `dist/server.js`.
- `pnpm test` runs unit/integration tests with Vitest.
- `pnpm test:e2e` runs browser parity and architecture probes on production builds.
- `pnpm test:modes` builds the `e2e/modes` fixture (entry selection, lazy chunks, server-only checks) and runs its browser tests.
- `pnpm test:parity` compares production SSR with the stage 1 snapshot semantically (after `pnpm build`; language paths,
  home and guides excluded since stage 7; the behavior of `<main>`, not its markup or classes).
- `pnpm build:conformance`, `pnpm check:core`, and `pnpm test:conformance <adapter>` validate runtime portability.
- `pnpm typecheck:server` checks the portable server and adapter API.
- `pnpm check` runs `state-surface check` (build analysis without bundling + `tsc --noEmit`).
- `pnpm test:scaffold` packs the engine and creates, installs, builds, tests and starts apps from the templates.
- `pnpm test:conformance:app` runs the conformance scenarios on the `vite` dev server and on the production build.
- `pnpm test:adapters [names]` runs the demo e2e against each adapter's production entry (after `pnpm build:adapter-app`;
  set `BASE_PATH` for both).
- `pnpm test:sdk` builds `e2e/sdk` and checks the real Sentry and Datadog RUM SDKs (npm, Loader/CDN) and the GTM runtime
  over 20 client navigations against a local intake (needs network for the CDNs).
- `pnpm perf:gate` enforces DC-17 (home and guide engine JS before `load` ≤ 8,444 B gzip, CLS ≤ 0.1); `pnpm perf` and
  `pnpm perf:report` record the report metrics (INP, first action, chunk and server bundle sizes, router navigation,
  Workers startup proxy).
- `pnpm format` and `pnpm format:check` apply or verify Prettier formatting.

## Coding Style & Naming Conventions

This repo is TypeScript-first and ESM (`"type": "module"`). Formatting is enforced by Prettier with semicolons, single quotes, trailing commas (ES5), and a 100-column line width. Use the formatter rather than manual alignment. Prefer `camelCase` for variables/functions, `PascalCase` for types/classes, and `lowerCamelCase` for module filenames (e.g., `ssrRenderer.ts`). Tests use the `*.test.ts` suffix and live alongside their modules.

## Testing Guidelines

Tests are written with Vitest and colocated in `engine/`, `routes/`, `client/`, and `shared/`. Run all tests with `pnpm test`, or filter locally with `pnpm test -- -t "keyword"`. There is no explicit coverage threshold configured; add or update tests for behavior, protocol, and API boundary changes.

## Commit & Pull Request Guidelines

Commit messages follow Conventional Commits as seen in history (e.g., `feat:`, `docs:`, `chore:`). Pull requests should include a concise summary, the tests you ran, and any relevant context (screenshots or before/after notes for UI/SSR output changes). Link related issues or design notes when applicable.
