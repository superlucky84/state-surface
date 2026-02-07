# Repository Guidelines

## Project Structure & Module Organization
The codebase is split by runtime responsibility. `server/` holds the Express runtime and SSR pipeline. `client/` contains the browser runtime, with the main entry at `client/main.ts` and supporting code in `client/runtime/`. `routes/` organizes page-specific templates and transitions (plus `_shared/` for shared templates). `shared/` provides protocol types, NDJSON utilities, and template checks used by both server and client. `demo/` is a reference app plus integration flows and tests. Architecture and contracts are documented in `DESIGN.md`, `PROTOCOL.md`, `IMPLEMENT.md`, and `BOOTSTRAP.md`.

## Build, Test, and Development Commands
Use Node.js (latest stable) with `pnpm@10.13.1`. Key commands:
- `pnpm dev` runs the dev server via `tsx watch server/index.ts`.
- `pnpm build` produces a production bundle with Vite.
- `pnpm test` runs all tests with Vitest.
- `pnpm format` and `pnpm format:check` apply or verify Prettier formatting.

## Coding Style & Naming Conventions
This repo is TypeScript-first and ESM (`"type": "module"`). Formatting is enforced by Prettier with semicolons, single quotes, trailing commas (ES5), and a 100-column line width. Use the formatter rather than manual alignment. Prefer `camelCase` for variables/functions, `PascalCase` for types/classes, and `lowerCamelCase` for module filenames (e.g., `ssrRenderer.ts`). Tests use the `*.test.ts` suffix and live alongside their modules.

## Testing Guidelines
Tests are written with Vitest and are colocated with their code under `client/`, `server/`, `shared/`, and `demo/`. Run all tests with `pnpm test`, or filter locally with `pnpm test -- -t "keyword"`. There is no explicit coverage threshold configured; add or update tests for any new behavior or protocol changes, especially in `shared/` contracts.

## Commit & Pull Request Guidelines
Commit messages follow Conventional Commits as seen in history (e.g., `feat:`, `docs:`, `chore:`). Pull requests should include a concise summary, the tests you ran, and any relevant context (screenshots or before/after notes for UI/SSR output changes). Link related issues or design notes when applicable.
