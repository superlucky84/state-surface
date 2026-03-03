# Release Notes Template

## Summary

- Release: `vX.Y.Z`
- Type: `patch | minor | major`

## Changes

- Runtime:
- CLI:
- Docs:

## Upgrade Procedure

Existing projects must upgrade with package update, not re-scaffolding.

```bash
pnpm up state-surface
pnpm test
pnpm build
```

For breaking changes, follow [MIGRATION.md](./MIGRATION.md).

## Verification Checklist

- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] SSR route smoke checks pass
- [ ] Transition NDJSON smoke checks pass
