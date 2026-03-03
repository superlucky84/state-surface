# Contributing to StateSurface

Thanks for contributing. This project follows a docs-first and test-gated workflow.

## Development Setup

Requirements:

- Node.js 20+
- `pnpm@10.13.1`

Install and run:

```bash
pnpm install
pnpm dev
```

Quality checks:

```bash
pnpm format:check
pnpm test
```

## Project Layout

- `engine/`: framework runtime (`server/`, `client/`, `shared/`)
- `routes/`, `layouts/`, `shared/`, `client/`: example/app code
- `create-state-surface/`: scaffolding CLI and template project
- `IMPLEMENT_PHASE2.md`: execution checklist and current phase status

## Contribution Workflow

1. Create a branch from `main`.
2. Make focused changes (one logical concern per PR).
3. Update docs when behavior/contracts change.
4. Run `pnpm format:check` and `pnpm test`.
5. Open a PR using the provided template.

## Commit Convention

Use Conventional Commits:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`
- `refactor: ...`
- `test: ...`
- `ci: ...`

Examples:

- `feat: add transition timeout option`
- `docs: update phase 2 handoff status`

## Pull Request Expectations

Each PR should include:

- Clear summary of what changed and why
- Linked issue(s) when relevant
- Test evidence (commands and outcomes)
- Migration notes for breaking changes

If your change affects public API, protocol, scaffolding output, or docs contracts, update related docs:

- `README.md`
- `PROTOCOL.md`
- `DESIGN_PHASE2.md` / `IMPLEMENT_PHASE2.md`
- `MIGRATION.md` and `CHANGELOG.md` (when release-facing)

## Reporting Bugs and Requesting Features

Use GitHub issue templates:

- Bug report: reproducible issue, expected vs actual behavior, environment
- Feature request: use case, proposal, alternatives, impact

## Code of Conduct

All contributors must follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
