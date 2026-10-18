# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

StateSurface 2.0 (plan and records: `docs/surface-expansion/`). Release pending the manual checks in
`docs/surface-expansion/MANUAL_TEST_CHECKLIST.md` (real devices, Firefox and Safari, screen readers,
a real Workers deployment, vendor accounts).

### Added

- Pages are `.tsx` functions in `routes/**/*.tsx` with `<Slot>` boundaries: static slots (no JS),
  server slots updated with server HTML (`swap="replace"` or `"morph"`), client slots and islands with
  `client:load|idle|visible|media|only`, `server:defer` slots behind encrypted tokens.
- Two-layer protocol: transitions yield state frames, the server reduces them per request and sends
  per-slot ops (`html`, `props`, `merge`, `remove`, `ui`); see `PROTOCOL.md`.
- Transitions in `transitions/**/*.ts` (path = name) with `defineTransition({ input, targets, mode,
flash, viewTransition })`, Standard Schema validation (422 field errors) and target-aware concurrency.
- JS-less action forms (`actionUrl()`, PRG 303 + signed one-time flash), `useAction`, `<Boot>`.
- Opt-in client router `<ClientRouter />`: server HTML swaps, `transition:persist` elements and islands,
  prefetch (hover, tap, viewport, load), `surface:*` events, `dataLayer` page views.
- Prerendered pages, language paths (`routes/[lang]/`), content collections (Markdown, MDX, YAML, JSON)
  with server-side highlighting, `<Image>`/`<Picture>` with build-time variants.
- Adapters for Node, Express, Bun, Deno and Cloudflare Workers on one Web Request/Response core,
  `surface.server.ts` handler options shared by dev and production, `state-surface check`.
- CSS Modules per page and per island, source-located build diagnostics, runtime trace (`onTrace`).
- `create-state-surface` minimal and demo templates with an adapter choice.
- Verification: conformance scenarios on five runtimes and on dev/prod, hardening suites (fuzz,
  malicious input, races, parallel SSR, limits), demo e2e on every adapter at `/` and `BASE_PATH=/demo`,
  browser e2e on generated apps, View Transition and BFCache e2e, real Sentry/Datadog RUM/GTM e2e,
  performance gate (`pnpm perf:gate`) and report (`pnpm perf`, `pnpm perf:report`).
- Community contribution docs and templates:
  - `CONTRIBUTING.md`
  - `CODE_OF_CONDUCT.md`
  - Issue templates for bug report and feature request
  - Pull request template

### Changed

- Engine JS is per page: static pages load none; the loader (2.9 KB gzip) loads the component host,
  plugin host, action runtime, router and morph chunks only when the page needs them. Home and guide
  pages load 7.7 KB gzip of engine JS before `load`, 73% below the 1.0 bundle (28.1 KB).
- In-page updates apply immediately; View Transitions are opt-in per action or slot and skipped for
  reduced motion, which also turns off the `data-animate` reveal animations.
- Requires `lithent` ^1.25.2.

### Removed

- The 1.0 APIs (`createApp`, template registry, `createStateSurface` plugins, transition hooks, `done`
  and `error` yields, cookie-based language selection); there is no compatibility layer.

### Fixed (stage 10)

- Client slots ignored `props`/`merge` updates with Lithent 1.25.2, which copies the props of a
  component created outside a diff.
- Workers builds crashed on the first request when wrangler bundled Prism's CommonJS files.
- `data-animate` reveal animations and pending movement ran under reduced motion.
- Demo pages scrolled horizontally at 320 to 360 px.

## [0.1.0] - 2026-03-10

### Added

- Public API split:
  - `state-surface` (shared/common APIs)
  - `state-surface/server` (server APIs)
  - `state-surface/client` (client APIs)
- Server `createApp()` factory and production SSR build/start workflow.
- Transition hooks (`onBeforeTransition`, `onAfterTransition`) for server extensibility.
- Client plugin system (`createStateSurface`, lifecycle hooks).
- NDJSON parser error hardening and transition timeout handling.
- Default security headers and configurable body size limit.
- `create-state-surface` scaffolding CLI and template project.
- MIT license and core README documentation.
- CI workflow for formatting and tests.

[Unreleased]: https://github.com/superlucky84/state-surface/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/superlucky84/state-surface/releases/tag/v0.1.0
