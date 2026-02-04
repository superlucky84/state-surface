# StateSurface Implementation Tracker

This document turns `DESIGN.md` into an executable implementation plan.
If context is lost, read in order:
`DESIGN.md` -> `PROTOCOL.md` -> `BOOTSTRAP.md` -> this file.

## How To Use This File

- Keep checklist items updated (`[ ]` -> `[x]`) as work lands.
- Add commit hashes in "Progress Log" after each meaningful step.
- If design changes, update `DESIGN.md` first, then sync this file.
- If frame contract changes, update `PROTOCOL.md` and sync checklists.
- Do not delete completed items; keep history visible.

## Locked Design Snapshot (from DESIGN.md)

- Server is source of truth; client projects DOM.
- `<h-state>` is a fixed DOM anchor and hydration boundary.
- Navigation is MPA; in-page updates come from streamed state frames.
- Transport is NDJSON over HTTP POST readable stream.
- State frame model supports `full` and `partial` with locked precedence rules.
- First frame in each stream is full.
- Concurrency policy is `abort previous`.
- Template loading is prebundle v1 + static registry.
- Error template key convention is `system:error` (recommended anchor).

## Execution Baseline

- Node.js: latest stable (at implementation time)
- pnpm: `10.13.1`
- Required scripts: `dev`, `build`, `test`

## Optional Library Policy (fp-pack)

- fp-pack may be used to improve readability in pure data-transform paths.
- Prefer fp-pack in `shared/frameOps.*` (normalize/merge/precedence/apply helpers).
- Keep SSR/hydration boundary code explicit (avoid over-abstracted chains).
- Avoid excessive point-free style; favor named functions with clear intent.
- If a transform becomes harder to read with fp-pack, use plain JS instead.

## Work Phases

### Phase 0: Repo/Foundation

- [ ] Create runtime folder structure (`server/`, `client/`, `shared/`).
- [ ] Add scripts in `package.json` (`dev`, `build`, `test`).
- [ ] Pin pnpm version usage to `10.13.1` in docs/setup notes.
- [ ] Add base lint/format setup (minimal, non-blocking).
- [ ] Smoke check: `dev` command starts without immediate runtime errors.

### Phase 1: Shared Protocol Contracts

- [ ] Keep `PROTOCOL.md` as the single protocol contract reference.
- [ ] Implement `StateFrame` runtime validator (not just TS type).
- [ ] Enforce locked NDJSON schema rules:
  - [ ] `full` default `true`
  - [ ] `full:false` requires `changed` or `removed`
  - [ ] `changed` keys must exist in `states`
  - [ ] `removed` keys must not exist in `states`
- [ ] Add parser helpers for NDJSON encode/decode.
- [ ] Smoke check: sample full/partial/error/done frames validate as expected.

### Phase 2: Server Runtime (Express)

- [ ] Implement `POST /transition/:name` NDJSON streaming endpoint.
- [ ] Implement transition execution pipeline (yield frames sequentially).
- [ ] Add server-side frame validation before streaming.
- [ ] Implement parser-based SSR `<h-state>` filling (`fillHState`).
- [ ] Implement `__STATE__` safe JSON embed helper (`safeStateJSON`).
- [ ] Implement SSR hash generation with canonicalization rules:
  - [ ] sha256
  - [ ] normalized whitespace
  - [ ] sorted attributes
  - [ ] comments excluded
  - [ ] dynamic attrs excluded
- [ ] Smoke check: transition endpoint streams valid NDJSON in correct order.

### Phase 3: Client Runtime Core

- [ ] Implement anchor discovery (`querySelectorAll('h-state[name]')`).
- [ ] Implement initial state bootstrap from `__STATE__`.
- [ ] Implement per-anchor hydration (not full-page hydration).
- [ ] Implement transition manager with `abort previous`.
- [ ] Implement frame queue and apply loop.
- [ ] Implement full frame apply (replace all active states).
- [ ] Implement partial frame apply (removed first, then changed merge).
- [ ] Implement backpressure policy:
  - [ ] coalesce consecutive partial frames
  - [ ] full frame supersedes pending partials
- [ ] Implement `done` handling (flush then end).
- [ ] Implement `error` handling:
  - [ ] if template exists, render `system:error` style frame
  - [ ] otherwise stop stream + surface error
- [ ] Smoke check: first user action updates only changed anchors.

### Phase 4: Template Registry + Rendering

- [ ] Create static template registry (`name -> module`).
- [ ] Share same registry for SSR and CSR paths.
- [ ] Add startup check for missing registry keys used in layout.
- [ ] Add fallback path for template load/render failure.
- [ ] Smoke check: missing template triggers fallback without crashing app.

### Phase 5: Observability/Dev Experience

- [ ] Add single trace hook API (`stateSurface.trace(event)`).
- [ ] Emit trace events (`received`, `applied`, `merged`, `dropped`, `error`, `done`).
- [ ] Add optional dev overlay (`?debug=1`) showing current `activeStates`.
- [ ] Smoke check: trace output and overlay both work in dev mode.

### Phase 6: Reference Flows (Must Demo)

- [ ] Implement article loading flow (loading -> content -> comments).
- [ ] Implement search flow with state combinations.
- [ ] Verify unchanged `<h-state>` roots do not remount/flicker.
- [ ] Verify first post-hydration user action updates only changed anchors.
- [ ] Smoke check: both demo flows run end-to-end in one dev session.

### Phase 7: Tests/Verification

- [ ] Unit tests: frame validator + precedence logic.
- [ ] Unit tests: NDJSON parser (chunk split edge cases).
- [ ] Integration tests: server stream -> client apply path.
- [ ] Integration tests: hydration mismatch fallback path.
- [ ] Regression tests: abort previous transition semantics.

## Definition of Done (v1 Prototype)

- [ ] End-to-end demo works with real NDJSON streamed transitions.
- [ ] Partial hydration/update works at `<h-state>` boundary.
- [ ] Locked protocol rules are enforced by tests.
- [ ] Debug trace + overlay available in dev mode.
- [ ] README includes run instructions and architecture summary.

## Open Questions (Keep Short)

- [ ] None currently. Add only blockers that affect immediate implementation.

## Progress Log

- 2026-02-04: Initial IMPLEMENT.md created from finalized DESIGN.md decisions.
