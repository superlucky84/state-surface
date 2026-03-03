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
