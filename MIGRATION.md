# Migration Guide

This document defines how existing StateSurface projects should be updated.

## Update Policy

- New project bootstrap: `npx create-state-surface <project-name>`
- Existing project update: `pnpm up state-surface`
- Do **not** re-run scaffolding for existing projects.

## Version Matrix

### v0.1.x

Current baseline release line.

No migration steps yet beyond standard dependency update:

```bash
pnpm up state-surface
pnpm test
pnpm build
```

### v2.0 (unreleased)

2.0 replaces the 1.0 APIs without a compatibility layer (see `CHANGELOG.md`).

#### What changed

- Pages: `routes/**/*.tsx` page functions with `<Slot>` boundaries replace the template registry and
  `createApp()`; layouts are components (`layouts/Layout.tsx`).
- Transitions: `transitions/**/*.ts` default-export `defineTransition(...)`; the file path is the name.
  The engine sends `done` and turns thrown errors into error frames (no `done`/`error` yields).
- Client: `definePlugin()` declared per page with `export const plugins`, `useAction()` in client
  components; `createStateSurface` is gone.
- Server options live in `surface.server.ts` (middleware, `onError`, limits) for dev and production.

#### Manual changes required

1. Create a 2.0 app with `npx create-state-surface` (pick the adapter) and move each page into
   `routes/` as a page function, each template into a slot component.
2. Move transitions to `transitions/`, declare `targets`, and drop `done`/`error` yields.
3. Port `createStateSurface` plugins to `definePlugin` (declared per page) and imperative transition
   calls to `useAction`; `data-action` buttons and forms keep working.
4. Require `lithent` ^1.25.2.

#### Verification

- `pnpm check` (build analysis and types), `pnpm test`, `pnpm build`
- the public guides (`/en/guide/quickstart`) walk through each concept with the 2.0 API

## Breaking Changes (Template)

When a breaking release is published, add a section:

```md
## vX.Y.0

### What changed

- ...

### Manual changes required

1. ...
2. ...

### Verification

- `pnpm test`
- `pnpm build`
- smoke test: route/transition scenarios
```
