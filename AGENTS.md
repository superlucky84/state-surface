# Repository Guidelines

## Project Structure & Module Organization

The runtime core lives in `engine/`:

- `engine/server/core/` for Web Request/Response routing, context, middleware, and streaming.
- `engine/adapters/` for Node, Express, Bun, Deno, and Cloudflare transports/static assets.
- `engine/build/` and `engine/vite.ts` for page discovery, the oxc call-site transform, diagnostics and generated manifests.
- `engine/server/projection.ts` and `transitionResponse.ts` for the request reducer and slot projection
  (authoring frames → per-slot `html`/`props`/`merge`/`remove`/`ui` ops).
- `engine/client/` for the browser runtime: loader, component host (activation, retry, resetKey), action
  runtime (target-aware concurrency, per-request pending, `useAction`), patch apply pipeline, morph chunk.
- `engine/server/flash.ts` and the `/_surface/action/<name>` endpoint for JS-less form submissions (PRG).
- `engine/shared/` for the two-layer protocol, NDJSON parsing, capability helpers, and shared contracts.

User/project code lives in `client/`, `layouts/`, `routes/`, `transitions/`, and `shared/`. Pages are `routes/**/*.tsx`
(files and folders starting with `_` are not pages); slot components live in `_components/` next to pages.
Transitions are `transitions/**/*.ts`; the path is the name (`transitions/comments/add.ts` → `"comments/add"`,
kebab-case segments). The build writes `.state-surface/actions.d.ts` (gitignored) to type `useAction`, `<Boot>`
and `actionUrl()`.
Scaffolding CLI lives in `create-state-surface/` (GitHub tarball에서 `scaffold/` 추출). `scaffold/`는 `pnpm build` 시 루트 파일 + `create-state-surface/overrides/`로 자동 생성.
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
- `pnpm test:parity` compares production SSR with the stage 1 snapshot semantically (after `pnpm build`).
- `pnpm build:conformance`, `pnpm check:core`, and `pnpm test:conformance <adapter>` validate runtime portability.
- `pnpm typecheck:server` checks the portable server and adapter API.
- `pnpm format` and `pnpm format:check` apply or verify Prettier formatting.

## Coding Style & Naming Conventions

This repo is TypeScript-first and ESM (`"type": "module"`). Formatting is enforced by Prettier with semicolons, single quotes, trailing commas (ES5), and a 100-column line width. Use the formatter rather than manual alignment. Prefer `camelCase` for variables/functions, `PascalCase` for types/classes, and `lowerCamelCase` for module filenames (e.g., `ssrRenderer.ts`). Tests use the `*.test.ts` suffix and live alongside their modules.

## Testing Guidelines

Tests are written with Vitest and colocated in `engine/`, `routes/`, and `shared/`. Run all tests with `pnpm test`, or filter locally with `pnpm test -- -t "keyword"`. There is no explicit coverage threshold configured; add or update tests for behavior, protocol, and API boundary changes.

## Commit & Pull Request Guidelines

Commit messages follow Conventional Commits as seen in history (e.g., `feat:`, `docs:`, `chore:`). Pull requests should include a concise summary, the tests you ran, and any relevant context (screenshots or before/after notes for UI/SSR output changes). Link related issues or design notes when applicable.
