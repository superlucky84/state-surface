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
- Routing is file-based (`routes/` directory) with `[param]` dynamic segments.
- Each route exports: `layout` + `transition` + optional `params`.
- Each route defines only its own page-specific `<h-state>` slots (no cross-page leaking).
- Surface/projection split is intentional:
  - `layout` returns a **string surface** (`surface.ts`/`layouts/*.ts`)
  - templates are **TSX projections** (`routes/**/templates/*.tsx`)
- SSR reuses transitions (first full frame = initial states).
- Client entry is route-agnostic (discovers + hydrates whatever is in DOM).

## Execution Baseline

- Node.js: latest stable (at implementation time)
- pnpm: `10.13.1`
- Styling: **Tailwind CSS** (utility-first)
- Required scripts: `dev`, `build`, `test`

## Reference Projects

Two sibling directories contain working code to reference during implementation:

### `../lithent` — Lithent library source

- SSR path: `renderToString` (recursive WDom→HTML), `hydration` (attach DOM + bind events)
- Hydration calls `render(wDom, el, null, true)` — skips DOM creation, only attaches events
- JSX runtime at `lithent/jsx-runtime` — exports `jsx`/`jsxs`/`Fragment`
- Vite plugin at `packages/lithentVite` — sets `esbuild.jsx: 'automatic'`, `jsxImportSource: 'lithent'`

### `../blog` — Vite + Lithent SSR prototype

- Dev: `createViteServer({ server: { middlewareMode: 'ssr' } })` → `vite.ssrLoadModule()`
- SSR: `renderToString(h(Layout, props))` → `<!DOCTYPE html>` prefix → inject script before `</body>`
- Hydration: `hydration(h(Layout, props), document.documentElement)`
- Data: `globalThis.pagedata` set on server, read on client at hydration time
- Prod: pre-built modules loaded via dynamic `import()` from `dist/`

Use these as ground truth for Vite config, SSR render flow, and hydration wiring.

## Optional Library Policy (fp-pack)

- fp-pack may be used to improve readability in pure data-transform paths.
- Prefer fp-pack in `shared/frameOps.*` (normalize/merge/precedence/apply helpers).
- Keep SSR/hydration boundary code explicit (avoid over-abstracted chains).
- Avoid excessive point-free style; favor named functions with clear intent.
- If a transform becomes harder to read with fp-pack, use plain JS instead.

## Work Phases

### Phase 0: Repo/Foundation

- [x] Create runtime folder structure (`server/`, `client/`, `shared/`).
- [x] Add scripts in `package.json` (`dev`, `build`, `test`).
- [x] Pin pnpm version usage to `10.13.1` in docs/setup notes.
- [x] Add base lint/format setup (minimal, non-blocking).
- [x] Smoke check: `dev` command starts without immediate runtime errors.

### Phase 1: Shared Protocol Contracts

- [x] Keep `PROTOCOL.md` as the single protocol contract reference.
- [x] Implement `StateFrame` runtime validator (not just TS type).
- [x] Enforce locked NDJSON schema rules:
  - [x] `full` default `true`
  - [x] `full:false` requires `changed` or `removed`
  - [x] `changed` keys must exist in `states`
  - [x] `removed` keys must not exist in `states`
- [x] Add parser helpers for NDJSON encode/decode.
- [x] Smoke check: sample full/partial/error/done frames validate as expected.

### Phase 2: Server Runtime (Express)

- [x] Implement `POST /transition/:name` NDJSON streaming endpoint.
- [x] Implement transition execution pipeline (yield frames sequentially).
- [x] Auto-discover transitions from `routes/**/transitions` at startup.
- [x] Add server-side frame validation before streaming.
- [x] Implement parser-based SSR `<h-state>` filling (`fillHState`).
- [x] Implement `__STATE__` safe JSON embed helper (`safeStateJSON`).
- [x] Implement SSR hash generation with canonicalization rules:
  - [x] sha256
  - [x] normalized whitespace
  - [x] sorted attributes
  - [x] comments excluded
  - [x] dynamic attrs excluded
- [x] Smoke check: transition endpoint streams valid NDJSON in correct order.

### Phase 3: Client Runtime Core

- [x] Implement anchor discovery (`querySelectorAll('h-state[name]')`).
- [x] Implement initial state bootstrap from `__STATE__`.
- [x] Implement per-anchor hydration (not full-page hydration).
- [x] Implement transition manager with `abort previous`.
- [x] Implement frame queue and apply loop.
- [x] Implement full frame apply (replace all active states).
- [x] Implement partial frame apply (removed first, then changed merge).
- [x] Implement backpressure policy:
  - [x] coalesce consecutive partial frames
  - [x] full frame supersedes pending partials
- [x] Implement `done` handling (flush then end).
- [x] Implement `error` handling:
  - [x] if template exists, render `system:error` style frame
  - [x] otherwise stop stream + surface error
- [x] Smoke check: first user action updates only changed anchors.

### Phase 4: Template Registry + Rendering

- [x] Create static template registry (`name -> module`).
- [x] Share same registry for SSR and CSR paths.
- [x] Auto-discover templates from `routes/**/templates` at startup.
- [x] Add startup check for missing registry keys used in layout.
- [x] Add fallback path for template load/render failure.
- [x] Smoke check: missing template triggers fallback without crashing app.
- [x] Refactor demo templates to **stateless TSX components** (use `mount`/`lmount` only when needed).

### Template Authoring (TSX)

Templates should be authored as **TSX components** (Lithent JSX runtime) and compiled by Vite.
Keep templates in `routes/**/templates/*.tsx` and register them in the static registry.
Prefer **stateless components** by default. Use `mount`/`lmount` only for client-only UI state.

### Surface Authoring (String Composition)

Route shell files should stay **string-based** and composable.
Prefer shared helpers in `surface.ts` / `layouts/*.ts`:

- `stateSlots(...)` for `<h-state>` anchor blocks
- `joinSurface(...)` for reusable string fragments
- `baseSurface(...)` for shared document shell

Keep the boundary strict:

- surface declares anchors and static shell
- templates render only inside anchors

### Phase 5: Observability/Dev Experience

- [x] Add single trace hook API (`stateSurface.trace(event)`).
- [x] Emit trace events (`received`, `applied`, `merged`, `dropped`, `error`, `done`).
- [x] Add optional dev overlay (`?debug=1`) showing current `activeStates`.
- [x] Smoke check: trace output and overlay both work in dev mode.

### Phase 6: Reference Flows (Must Demo)

- [x] Implement article loading flow (loading -> content -> comments).
- [x] Implement search flow with state combinations.
- [x] Verify unchanged `<h-state>` roots do not remount/flicker.
- [x] Verify first post-hydration user action updates only changed anchors.
- [x] Smoke check: both demo flows run end-to-end in one dev session.

### Phase 7: Tests/Verification

- [x] Unit tests: frame validator + precedence logic.
- [x] Unit tests: NDJSON parser (chunk split edge cases).
- [x] Integration tests: server stream -> client apply path.
- [x] Integration tests: hydration mismatch fallback path.
- [x] Regression tests: abort previous transition semantics.

### Phase 8: Multi-Page Routing

- [x] Define `RouteModule` type contract (`layout`, `transition`, `params`, `initial`, `boot`).
- [x] Implement file-based route scanner (`routes/` directory → URL patterns).
  - [x] `index.ts` → directory root
  - [x] `[param].ts` → dynamic segment (`:param`)
  - [x] Nested directories → nested URL paths
- [x] Implement `getInitialStates` helper:
  - [x] If `initial` exists, use it.
  - [x] Else run transition and collect first **full** frame.
  - [x] If first frame is partial, return 500 with clear error.
- [x] Implement route-to-Express registration (auto `app.get()` per discovered route).
- [x] Implement per-route SSR pipeline (route module → layout → fillHState → respond).
- [x] Implement boot config injection and client auto-run (SSR → immediate transition).
- [x] Create shared surface helpers (`layouts/surface.ts`) for string composition.
- [x] Enforce surface/projection boundary (surface anchors only, TSX inside anchors only).
- [x] Migrate existing demo to route files:
  - [x] `routes/index.ts` → `/` (article demo page)
  - [x] `routes/article/[id].ts` → `/article/:id`
  - [x] `routes/search.ts` → `/search`
- [x] Verify client entry (`client/main.ts`) works unchanged across all routes.
- [x] Add tests: route scanner (filename → URL pattern conversion).
- [x] Add tests: `getInitialStates` (initial override + transition fallback).
- [x] Add tests: SSR error when first frame is partial and `initial` missing.
- [x] Add tests: `boot` auto-run (SSR hydrates then immediately transitions).
- [x] Add tests: multi-route SSR (each route renders correct layout + states).
- [x] Smoke check: navigate between routes via `<a>` links, each page SSR-renders correctly.
- [x] Migrate `demo/layout.ts` to shared `surface.ts` helpers and then route-based surfaces.
- [x] Relocate demo tests to route-oriented fixtures (or keep under `demo/` with updated scope).

**Example (initial + boot)** — include in one route module:

```ts
export default {
  layout,
  transition: 'article-load',
  params: req => ({ articleId: Number(req.params.id) }),
  initial: req => ({
    'page:header': { title: 'Blog', nav: 'article' },
    'page:content': { loading: false, articleId: Number(req.params.id) },
  }),
  boot: { auto: true, params: req => ({ articleId: Number(req.params.id) }) },
};
```

### Phase 9: Routing Tests/Polish

- [x] Edge case: route with no initial transition (static page, no `__STATE__`).
- [x] Edge case: dynamic param validation (non-numeric `[id]` etc.).
- [x] Edge case: 404 handling (no matching route file).
- [x] Verify Vite dev middleware serves client assets on all routes.
- [x] Update demo with cross-route navigation links.
- [x] Smoke check: full demo with 3+ routes works end-to-end.

### Phase 10: Route-Level Surface Independence

Per DESIGN.md Section 2.4 — each route must define only the `<h-state>` slots relevant to its own page purpose. No route should be a catch-all holding slots from other pages.

**Problem:** `routes/index.ts` currently includes all demo slots (`page:content`, `panel:comments`, `search:input`, `search:results`) and demo controls on a single page. This is a leftover from the single-page demo era and violates the surface independence principle.

**Goal:** Refactor route files so the project serves as a **well-structured multi-page site example** where each page has an independent surface with page-specific slots only.

**Target page structure:**

| Route              | Page-specific slots                 | Shared slots (via baseSurface) |
| ------------------ | ----------------------------------- | ------------------------------ |
| `GET /`            | `page:hero`, `page:recent-articles` | `page:header`, `system:error`  |
| `GET /article/:id` | `page:content`, `panel:comments`    | `page:header`, `system:error`  |
| `GET /search`      | `search:input`, `search:results`    | `page:header`, `system:error`  |
| `GET /about`       | _(static — no dynamic slots)_       | `page:header`, `system:error`  |

- [x] Redesign `routes/index.ts` as a proper home page:
  - [x] Replace catch-all slots with home-specific slots (`page:hero`, `page:recent-articles`).
  - [x] Remove demo controls (buttons that trigger article-load/search on the same page).
  - [x] Use `initial` only for home SSR state (no dedicated `home-load` transition needed).
- [x] Create home page templates:
  - [x] `routes/index/templates/pageHero.tsx` — hero/welcome section.
  - [x] `routes/index/templates/pageRecentArticles.tsx` — recent article list.
- [x] Create home page transition (if needed):
  - [x] Not needed in current design (`initial`-only home page).
- [x] Verify `routes/article/[id].ts` already follows the principle (article-only slots).
- [x] Verify `routes/search.ts` already follows the principle (search-only slots).
- [x] Set up Tailwind CSS:
  - [x] Install `tailwindcss` + Vite plugin (`@tailwindcss/vite`).
  - [x] Configure source scan paths for surface (`.ts`) and template (`.tsx`) files.
  - [x] Replace existing inline `<style>` blocks with Tailwind utility classes.
  - [x] Tailwind classes work in both surface strings and TSX templates.
- [x] Update tests:
  - [x] `server/demoSsr.test.ts` → update assertions for new home page structure.
  - [x] `server/demoIntegration.test.ts` → add home surface-independence assertion.
  - [x] Add home page-specific tests.
- [x] Smoke check: each route renders only its own slots, no cross-page slot leakage.
- [x] Smoke check: full site navigation works end-to-end across all routes.

### Phase 11: Action System + Pending State

DESIGN.md Section 3.4에 정의된 선언적 액션 바인딩과 pending 상태를 구현한다.
사용자는 template에서 `data-action` + `data-params`만 선언하면 되고,
engine이 자동으로 이벤트 위임, transition 호출, pending 표시를 처리한다.

**User-facing API:**

```tsx
// template 안에서 선언만 하면 끝
<button data-action="action-demo" data-params='{"type":"button","variant":"primary"}'>
  Run Action
</button>

// pending 범위 제한 (optional)
<button data-action="search" data-pending-targets="search:results">
  Search
</button>
```

**Checklist:**

- [x] Implement action event delegation in engine:
  - [x] `click` listener on `document` — discover `[data-action]` elements.
  - [x] Parse `data-action` (transition name) + `data-params` (JSON → params object).
  - [x] Call `surface.transition(action, params)` automatically.
  - [x] `submit` listener for `<form data-action="...">` (prevent default + serialize).
- [x] Implement pending state in `StateSurface`:
  - [x] On `transition()` call: add `data-pending` attribute to target anchors.
  - [x] Default scope: all anchors. Optionally limited by `data-pending-targets`.
  - [x] On first frame arrival: remove `data-pending` from all anchors.
  - [x] On error/abort: remove `data-pending` from all anchors.
- [x] Add pending CSS to `client/styles.css`:
  - [x] `h-state[data-pending]` — opacity, pointer-events: none, transition.
- [x] Remove manual `surface.transition()` calls from `client/main.ts` (keep only boot auto-run).
- [x] Update existing templates with `data-action` attributes:
  - [x] Search page: input/button triggers `data-action="search"`.
  - [x] Feature/Chat pages: button/form actions use declarative `data-action`.
  - [x] `routes/article/`는 Phase 12에서 제거되어 해당 항목은 대체 완료.
- [x] Add tests:
  - [x] Action discovery: click on `[data-action]` triggers transition.
  - [x] Params parsing: `data-params` JSON correctly passed.
  - [x] Pending state: `data-pending` added on transition start, removed on first frame.
  - [x] Pending targets: `data-pending-targets` limits scope.
  - [x] Form submission: `<form data-action>` submit triggers transition.
  - [x] Abort: pending cleared when new action aborts previous.
- [ ] Smoke check: search/features/chat 페이지 액션이 `data-action`으로 end-to-end 동작.
- [ ] Smoke check: pending visual feedback visible during slow transitions.

### Phase 12: Demo Site Redesign — Self-Documenting Feature Showcase

(Phase 11 action system 완료 후 진행)

기존 데모 페이지를 재기획하여, 각 페이지가 StateSurface의 특정 기능을 **콘텐츠로 설명**하면서
동시에 해당 기능을 **구현으로 시연**하는 자기문서화(self-documenting) 사이트로 전환한다.

**설계 원칙:**

- 페이지를 열면 "이 기능이 뭔지" 읽으면서 "이 기능이 동작하는 것"을 체험
- 기존 article/search 데모를 교체 (chat은 Phase 13에서 별도 구현)
- 모든 StateSurface 핵심 기능이 최소 1개 페이지에서 시연됨

**Target page structure (DESIGN.md Section 2.4 참조):**

| Route                 | 콘텐츠                                                     | 시연 기능                                          |
| --------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| `/`                   | StateSurface 소개 — 4 핵심 개념 카드 + 각 기능 페이지 링크 | `initial` SSR only, surface 조합                   |
| `/guide/[slug]`       | 개념별 가이드 (surface, template, transition, action)      | Dynamic `[param]`, boot auto-run, full→partial     |
| `/features/streaming` | 스트리밍 데모 — 프레임 흐름 실시간 시각화                  | Full/partial, `removed`, error frame               |
| `/features/actions`   | 액션 플레이그라운드 — 버튼, 폼, scoped pending 체험        | `data-action`, form submit, `data-pending-targets` |
| `/search`             | StateSurface 기능/개념 검색                                | Form `data-action`, pending 상태                   |

**Target slot structure:**

| Route                 | Page-specific slots                             | Shared (via baseSurface)      |
| --------------------- | ----------------------------------------------- | ----------------------------- |
| `/`                   | `page:hero`, `page:concepts`, `page:features`   | `page:header`, `system:error` |
| `/guide/[slug]`       | `guide:content`, `guide:toc`                    | `page:header`, `system:error` |
| `/features/streaming` | `demo:controls`, `demo:timeline`, `demo:output` | `page:header`, `system:error` |
| `/features/actions`   | `actions:playground`, `actions:log`             | `page:header`, `system:error` |
| `/search`             | `search:input`, `search:results`                | `page:header`, `system:error` |

**Checklist:**

- [x] Redesign home page (`/`):
  - [x] `routes/index.ts` — hero (framework intro) + concepts (4 카드) + features (데모 링크).
  - [x] `routes/index/templates/pageHero.tsx` — StateSurface 소개 히어로.
  - [x] `routes/index/templates/pageConcepts.tsx` — Surface, Template, Transition, Action 4 카드.
  - [x] `routes/index/templates/pageFeatures.tsx` — 기능 데모 페이지 링크 목록.
  - [x] `initial` only (transition 없음) — 정적 SSR의 모범 예시.
- [x] Create guide route (`/guide/[slug]`):
  - [x] `routes/guide/[slug].ts` — 개념 가이드 surface (guide:content, guide:toc).
  - [x] `routes/guide/transitions/guideLoad.ts`:
    - [x] Full frame: 가이드 메타 + TOC (즉시).
    - [x] Partial frame: 본문 콘텐츠 로드 (스트리밍 시연).
  - [x] `routes/guide/templates/guideContent.tsx` — 가이드 본문 렌더링.
  - [x] `routes/guide/templates/guideToc.tsx` — 목차 사이드바.
  - [x] Slug별 콘텐츠 데이터: `surface`, `template`, `transition`, `action`.
  - [x] `boot: { auto: true }` — SSR 후 자동 콘텐츠 로드.
  - [x] 가이드 콘텐츠는 해당 기능을 설명하는 텍스트.
- [x] Create streaming demo page (`/features/streaming`):
  - [x] `routes/features/streaming.ts` — 스트리밍 시각화 surface.
  - [x] `routes/features/streaming/transitions/streamDemo.ts`:
    - [x] Full frame → partial (changed) → partial (removed) → error → done 시퀀스.
    - [x] 각 프레임 타입을 의도적으로 시연.
  - [x] `routes/features/streaming/templates/demoControls.tsx` — 프레임 발사 버튼들.
  - [x] `routes/features/streaming/templates/demoTimeline.tsx` — 프레임 도착 타임라인.
  - [x] `routes/features/streaming/templates/demoOutput.tsx` — 현재 activeStates 시각화.
  - [x] `removed` 키 시연 (이전에 빠져있던 기능).
  - [x] Error frame 시연.
- [x] Create actions playground page (`/features/actions`):
  - [x] `routes/features/actions.ts` — 액션 플레이그라운드 surface.
  - [x] `routes/features/actions/transitions/actionDemo.ts` — 다양한 액션 처리.
  - [x] `routes/features/actions/templates/actionsPlayground.tsx`:
    - [x] 버튼 `data-action` 예제.
    - [x] Form `data-action` 제출 예제.
    - [x] `data-pending-targets` scoped pending 예제.
    - [x] 다중 action 버튼 예제.
  - [x] `routes/features/actions/templates/actionsLog.tsx` — 액션 이벤트 로그 표시.
- [x] Redesign search page (`/search`):
  - [x] `routes/search.ts` — StateSurface 기능/개념 검색으로 콘텐츠 변경.
  - [x] `routes/search/transitions/search.ts` — 기능 목록에서 검색.
  - [x] 검색 결과는 StateSurface 기능/개념 설명 + 해당 데모 페이지 링크.
- [x] Remove old routes:
  - [x] `routes/article/` 디렉터리 제거 (guide로 대체).
  - [x] 관련 transition (article-load) 제거.
- [x] Update navigation:
  - [x] `routes/_shared/templates/pageHeader.tsx` — 새 페이지 구조 반영.
  - [x] 모든 페이지 간 링크 동작 확인.
- [x] Update tests:
  - [x] 기존 article 관련 테스트 제거/교체.
  - [x] 각 새 route에 대한 SSR 테스트.
  - [x] Guide dynamic param 테스트.
  - [x] Streaming demo 프레임 시퀀스 테스트.
  - [x] Actions playground 테스트.
  - [x] Cross-page slot independence 재검증.
- [x] Smoke check: 모든 페이지 SSR 정상 렌더링.
- [x] Smoke check: 페이지 간 네비게이션 정상 동작.
- [x] Smoke check: 각 페이지에서 시연하는 기능이 실제로 동작.

### Phase 12.1: i18n — Korean / English Bilingual Content

(Phase 12 demo site 완료 후 진행)

모든 데모 페이지에 한/영 전환 기능을 추가한다.
헤더 상단에 언어 전환 버튼, 쿠키 기반 언어 유지, SSR 시점부터 올바른 언어 렌더링.

**설계:**

- 언어 전환은 `data-action="switch-lang"` transition으로 처리.
- 언어 상태는 `lang` 쿠키에 저장 (`ko` | `en`, 기본값 `en`).
- `initial(req)`에서 쿠키를 읽어 해당 언어 데이터로 SSR.
- 콘텐츠 데이터는 서버에 `{ ko, en }` 구조로 보관, 선택된 언어만 클라이언트에 전송.

**Checklist:**

- [x] 언어 콘텐츠 데이터 구조 정의:
  - [x] 각 route의 콘텐츠를 `{ ko: ..., en: ... }` 형태로 재구성.
  - [x] 홈(`/`): hero, concepts, features 한글 콘텐츠 작성.
  - [x] 가이드(`/guide/[slug]`): surface, template, transition, action 한글 가이드.
  - [x] 스트리밍(`/features/streaming`): controls, timeline 라벨 한글화.
  - [x] 액션(`/features/actions`): playground, log 라벨 한글화.
  - [x] 검색(`/search`): 검색 항목 + UI 라벨 한글화.
- [x] 쿠키 인프라:
  - [x] Express에 `cookie-parser` 미들웨어 추가 (또는 수동 파싱).
  - [x] `req.cookies.lang` 읽기 헬퍼 (기본값 `en`).
- [x] 언어 전환 transition:
  - [x] `routes/_shared/transitions/switchLang.ts` 생성.
  - [x] 현재 라우트의 모든 슬롯을 해당 언어로 full frame yield.
  - [x] 응답 헤더에 `Set-Cookie: lang=ko|en` 설정.
- [x] 헤더 전환 버튼:
  - [x] `pageHeader.tsx`에 ko/en 토글 버튼 추가.
  - [x] `data-action="switch-lang"` + `data-params='{"lang":"ko"}'`.
  - [x] 현재 언어 상태를 props로 전달 받아 활성 표시.
- [x] 각 route의 `initial(req)` 업데이트:
  - [x] 쿠키에서 언어를 읽어 해당 언어 데이터 반환.
  - [x] 홈, 가이드, 스트리밍, 액션, 검색 모든 route 적용.
- [x] 각 route의 transition 업데이트:
  - [x] params에서 `lang` 수신 또는 기본값 사용.
  - [x] 해당 언어 콘텐츠로 frame yield.
- [x] 테스트:
  - [x] SSR: `lang=ko` 쿠키 → 한국어 콘텐츠 렌더링 확인.
  - [x] SSR: 쿠키 없음 → 영어 기본 렌더링 확인.
  - [x] Transition: `switch-lang` → full frame으로 전체 언어 전환 확인.
  - [x] 쿠키 설정: 전환 후 `Set-Cookie` 헤더 확인.
- [ ] Smoke check: 모든 페이지에서 ko/en 전환 동작.
- [ ] Smoke check: 언어 전환 후 MPA 네비게이션 시 쿠키 유지.

### Phase 12.2: Base Path — Sub-Path Mounting

(Phase 12.1 i18n 완료 후 진행)

StateSurface 앱을 기존 서비스의 서브 경로(예: `/state-surface/`)에 마운트할 수 있도록
basePath 설정 기능을 추가한다. 환경변수 `BASE_PATH`로 설정하면 서버/클라이언트/템플릿 전체에 자동 전파.

**설계:**

- `shared/basePath.ts` — `setBasePath()`, `getBasePath()`, `prefixPath()` 중앙 헬퍼.
- 서버: `process.env.BASE_PATH` 읽어서 Express 라우트 + transition 엔드포인트에 prefix.
- 클라이언트: SSR HTML의 `<script id="__BASE_PATH__">` → `client/main.ts`에서 읽어서
  `StateSurface` 인스턴스와 `setBasePath()`에 전달.
- basePath='' (기본값)이면 현재와 완전히 동일하게 동작 (zero-cost default).

**Checklist:**

- [x] `shared/basePath.ts` 생성:
  - [x] `setBasePath(path)` — 정규화 (앞에 `/`, 뒤에 `/` 제거).
  - [x] `getBasePath()` — 현재 basePath 반환.
  - [x] `prefixPath(url)` — basePath + url 조합.
- [x] 서버 적용:
  - [x] `server/index.ts` — `process.env.BASE_PATH` 읽어서 `setBasePath()` 호출.
  - [x] `server/index.ts` — `app.get(prefixPath(route.urlPattern))` 라우트 마운트.
  - [x] `server/index.ts` — `app.post(prefixPath('/transition/:name'))` 엔드포인트.
  - [x] `layouts/surface.ts` — `<script src>` 에셋 경로에 `prefixPath()` 적용.
  - [x] `shared/i18n.ts` — 쿠키 `Path`에 basePath 반영.
- [x] SSR → 클라이언트 전달:
  - [x] `server/ssr.ts` — `buildBasePathScript(basePath)` 함수 추가.
  - [x] `server/routeHandler.ts` — stateScript에 basePathScript 포함.
- [x] 클라이언트 적용:
  - [x] `client/runtime/stateSurface.ts` — `StateSurfaceOptions.basePath` 추가, fetch URL prefix.
  - [x] `client/main.ts` — `__BASE_PATH__` 읽어서 `setBasePath()` + `StateSurface` 전달.
- [x] 콘텐츠/템플릿 href:
  - [x] `shared/content.ts` — 모든 href에 `prefixPath()` 적용 (함수 반환 시점, static const 제외).
  - [x] `routes/_shared/templates/pageHeader.tsx` — 네비게이션 href에 `prefixPath()`.
  - [x] `routes/index/templates/pageHero.tsx` — fallback href에 `prefixPath()`.
  - [x] `routes/guide/templates/guideToc.tsx` — `/guide/${item}`에 `prefixPath()`.
  - [x] `routes/guide/templates/guideContent.tsx` — `/guide/${s}`에 `prefixPath()`.
- [x] Vite 설정:
  - [x] `vite.config.ts` — `base: process.env.BASE_PATH || '/'` 설정.
- [x] 테스트:
  - [x] `shared/basePath.test.ts` — prefixPath 유틸 테스트 (12 tests).
  - [x] basePath='' 기본값에서 기존 테스트 전체 통과 (186 tests, 0 regressions).
  - [ ] basePath 설정 후 Express 라우트 접근, transition URL, 쿠키 Path 검증.
- [ ] Smoke check: `BASE_PATH=/demo pnpm dev`로 전체 사이트 동작 확인.

### Phase 13: Chatbot Demo Route

(Phase 12.1 i18n 완료 후 진행)

StateSurface의 스트리밍 아키텍처가 챗봇 UI와 자연스럽게 매핑됨을 보여주는 데모 route.
LLM 응답 스트리밍 → NDJSON partial frame → progressive UI construction.

**Why this demo matters:**

- NDJSON 스트리밍이 가장 빛나는 실전 유스케이스
- `abort previous` = 생성 중단 (별도 취소 로직 불필요)
- partial frame의 점진적 UI 구성이 가장 직관적으로 드러남

**Target page structure:**

| Route       | Slots                                        | Shared slots                  |
| ----------- | -------------------------------------------- | ----------------------------- |
| `GET /chat` | `chat:messages`, `chat:input`, `chat:typing` | `page:header`, `system:error` |

**Performance strategy — `cacheUpdate` (lithent/helper):**

대화 로그가 길어질 때 이전 메시지의 불필요한 re-render/diff를 방지.
`cacheUpdate`는 의존성이 변하지 않으면 캐싱된 VDom을 그대로 반환하여 diffing 자체를 건너뜀.

```tsx
import { cacheUpdate } from 'lithent/helper';

const ChatMessage = mount<MessageProps>(renew => {
  return cacheUpdate(
    props => [props.id, props.text, props.role],
    props => (
      <div class={`message ${props.role}`}>
        <strong>{props.role}:</strong> {props.text}
      </div>
    )
  );
});

// key + cacheUpdate 조합: 기존 메시지 = zero diff, 새 메시지만 렌더
{
  messages.map(m => <ChatMessage key={m.id} {...m} />);
}
```

**Checklist:**

- [x] Create `routes/chat.ts` with chat-specific surface (`chat:messages`, `chat:input`, `chat:typing`).
- [x] Create `routes/chat/transitions/chat.ts`:
  - [x] Yield full frame: user message + typing indicator.
  - [x] Yield partial frames: bot 응답 토큰 누적 (simulated LLM stream).
  - [x] Yield final partial: 완성된 응답 + typing 제거 (`removed`).
  - [x] Yield `done`.
- [x] Create chat templates:
  - [x] `routes/chat/templates/chatMessages.tsx` — message list with `cacheUpdate` per message.
  - [x] `routes/chat/templates/chatInput.tsx` — input form.
  - [x] `routes/chat/templates/chatTyping.tsx` — typing indicator.
- [x] Verify `abort previous` works as "cancel generation":
  - [x] Send new message during bot streaming → previous stream cancels.
  - [x] Only latest conversation state survives.
- [x] Performance verification:
  - [x] 100+ messages: old messages produce zero DOM mutations.
  - [x] `cacheUpdate` dependency check confirms skip for unchanged messages.
- [x] Update `pageHeader.tsx` nav with `/chat` link.
- [x] Add tests:
  - [x] Transition yields correct frame sequence (full → partial\* → done).
  - [x] Abort mid-stream produces clean state.
  - [x] SSR initial render shows empty chat or welcome message.
- [ ] Smoke check: full chat flow works end-to-end in dev server.

### Phase 14: Engine/User Code Separation

프레임워크 내부 코어 코드를 `engine/`으로 통합하여, 사용자가 작성하는 영역과 명확히 분리한다.
사용자는 **surface, template, transition, action** 4가지 개념만 신경 쓰면 되고,
엔진 내부 로직은 열어볼 필요가 없는 구조를 만든다.

**현재 (혼재):**

```
server/          ← 엔진 + 진입점
client/runtime/  ← 엔진
shared/          ← 엔진
routes/          ← 사용자
layouts/         ← 사용자
```

**목표:**

```
engine/
├── server/      # Express 라우트 핸들러, SSR 파이프라인, bootstrap,
│                # 라우트 스캐너, initialStates, transition 실행, fsUtils
├── client/      # StateSurface 클래스, 프레임 큐, apply loop,
│                # 하이드레이션, lithentBridge, devOverlay
└── shared/      # protocol (validator/types), ndjson, templateRegistry,
                 # templateCheck, routeModule type

routes/          # 사용자: surface(layout) + transition + template + initial/boot
layouts/         # 사용자: surface 헬퍼 (stateSlots, joinSurface, baseSurface 등)
```

**사용자 노출 4개념:**

| 개념           | 사용자가 하는 일                      | 파일 위치                        |
| -------------- | ------------------------------------- | -------------------------------- |
| **Surface**    | HTML 문자열로 페이지 뼈대 + 앵커 선언 | `routes/*.ts` layout, `layouts/` |
| **Template**   | TSX로 앵커 안 콘텐츠 정의             | `routes/**/templates/*.tsx`      |
| **Transition** | async generator로 상태 프레임 yield   | `routes/**/transitions/*.ts`     |
| **Action**     | 클라이언트에서 transition 호출 트리거 | `client/main.ts`, DOM event      |

**Checklist:**

- [ ] Create `engine/` directory structure (`engine/server/`, `engine/client/`, `engine/shared/`).
- [ ] Move server engine code:
  - [ ] `server/ssr.ts` → `engine/server/ssr.ts`
  - [ ] `server/bootstrap.ts` → `engine/server/bootstrap.ts`
  - [ ] `server/routeScanner.ts` → `engine/server/routeScanner.ts`
  - [ ] `server/routeHandler.ts` → `engine/server/routeHandler.ts`
  - [ ] `server/initialStates.ts` → `engine/server/initialStates.ts`
  - [ ] `server/transition.ts` → `engine/server/transition.ts`
  - [ ] `server/fsUtils.ts` → `engine/server/fsUtils.ts`
- [ ] Move client engine code:
  - [ ] `client/runtime/stateSurface.ts` → `engine/client/stateSurface.ts`
  - [ ] `client/runtime/lithentBridge.ts` → `engine/client/lithentBridge.ts`
  - [ ] `client/runtime/devOverlay.ts` → `engine/client/devOverlay.ts`
- [ ] Move shared engine code:
  - [ ] `shared/protocol.ts` → `engine/shared/protocol.ts`
  - [ ] `shared/ndjson.ts` → `engine/shared/ndjson.ts`
  - [ ] `shared/templateRegistry.ts` → `engine/shared/templateRegistry.ts`
  - [ ] `shared/templateCheck.ts` → `engine/shared/templateCheck.ts`
  - [ ] `shared/routeModule.ts` → `engine/shared/routeModule.ts`
- [ ] Keep user-facing entry points thin:
  - [ ] `server/index.ts` — 얇은 진입점, `engine/server/`에서 import하여 조합만.
  - [ ] `client/main.ts` — 얇은 진입점, `engine/client/`에서 import하여 bootstrap + action 바인딩만.
- [ ] Move test files alongside engine code:
  - [ ] `server/*.test.ts` → `engine/server/*.test.ts`
  - [ ] `client/runtime/*.test.ts` → `engine/client/*.test.ts`
  - [ ] `shared/*.test.ts` → `engine/shared/*.test.ts`
- [ ] Update all import paths across the codebase.
- [ ] Update `tsconfig.json` include paths.
- [ ] Update `CLAUDE.md` folder structure documentation.
- [ ] Verify all tests pass after migration (zero regressions).
- [ ] Smoke check: `pnpm dev` serves all routes correctly after restructure.

## Definition of Done (v1 Prototype)

- [x] End-to-end demo works with real NDJSON streamed transitions.
- [x] Partial hydration/update works at `<h-state>` boundary.
- [x] Locked protocol rules are enforced by tests.
- [x] Debug trace + overlay available in dev mode.
- [x] Multi-page routing works with file-based route discovery.
- [ ] README includes run instructions and architecture summary.

## Open Questions (Keep Short)

- [ ] None currently. Add only blockers that affect immediate implementation.

## Progress Log

- 2026-02-04: Initial IMPLEMENT.md created from finalized DESIGN.md decisions.
- 2026-02-06: Phase 8-9 (multi-page routing) added to plan.
- 2026-02-11: Locked surface/projection asymmetry and added surface composition tasks.
- 2026-02-14: Phase 8 complete — file-based route discovery, per-route SSR, boot config, demo migration (145 tests passing).
- 2026-02-14: Phase 9 complete — static page route, param validation, 404 handling, cross-route nav (160 tests passing).
- 2026-02-18: Phase 12.2 complete — basePath sub-path mounting. shared/basePath.ts (setBasePath/getBasePath/prefixPath), server routes/transition endpoint prefix, SSR **BASE_PATH** script tag, client bootstrap, template href prefix, Vite base option. (186 tests passing).
