# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Community contribution docs and templates:
  - `CONTRIBUTING.md`
  - `CODE_OF_CONDUCT.md`
  - Issue templates for bug report and feature request
  - Pull request template

## [0.1.0] - TBD

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
