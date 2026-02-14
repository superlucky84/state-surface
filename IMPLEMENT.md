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

| Route | Page-specific slots | Shared slots (via baseSurface) |
|-------|--------------------|---------------------------------|
| `GET /` | `page:hero`, `page:recent-articles` | `page:header`, `system:error` |
| `GET /article/:id` | `page:content`, `panel:comments` | `page:header`, `system:error` |
| `GET /search` | `search:input`, `search:results` | `page:header`, `system:error` |
| `GET /about` | *(static — no dynamic slots)* | `page:header`, `system:error` |

- [ ] Redesign `routes/index.ts` as a proper home page:
  - [ ] Replace catch-all slots with home-specific slots (`page:hero`, `page:recent-articles`).
  - [ ] Remove demo controls (buttons that trigger article-load/search on the same page).
  - [ ] Create a home-specific transition (e.g., `home-load`) or use `initial` only.
- [ ] Create home page templates:
  - [ ] `routes/index/templates/pageHero.tsx` — hero/welcome section.
  - [ ] `routes/index/templates/pageRecentArticles.tsx` — recent article list.
- [ ] Create home page transition (if needed):
  - [ ] `routes/index/transitions/homeLoad.ts` — yields home-specific state frames.
- [ ] Verify `routes/article/[id].ts` already follows the principle (article-only slots).
- [ ] Verify `routes/search.ts` already follows the principle (search-only slots).
- [ ] Set up Tailwind CSS:
  - [ ] Install `tailwindcss` + Vite plugin (`@tailwindcss/vite`).
  - [ ] Configure `content` paths for surface (`.ts`) and template (`.tsx`) files.
  - [ ] Replace existing inline `<style>` blocks with Tailwind utility classes.
  - [ ] Tailwind classes work in both surface strings and TSX templates.
- [ ] Update tests:
  - [ ] `server/demoSsr.test.ts` → update assertions for new home page structure.
  - [ ] `server/demoIntegration.test.ts` → update or split per-route integration tests.
  - [ ] Add home page-specific tests.
- [ ] Smoke check: each route renders only its own slots, no cross-page slot leakage.
- [ ] Smoke check: full site navigation works end-to-end across all routes.

### Phase 11: Chatbot Demo Route

StateSurface의 스트리밍 아키텍처가 챗봇 UI와 자연스럽게 매핑됨을 보여주는 데모 route.
LLM 응답 스트리밍 → NDJSON partial frame → progressive UI construction.

**Why this demo matters:**
- NDJSON 스트리밍이 가장 빛나는 실전 유스케이스
- `abort previous` = 생성 중단 (별도 취소 로직 불필요)
- partial frame의 점진적 UI 구성이 가장 직관적으로 드러남

**Target page structure:**

| Route | Slots | Shared slots |
|-------|-------|--------------|
| `GET /chat` | `chat:messages`, `chat:input`, `chat:typing` | `page:header`, `system:error` |

**Performance strategy — `cacheUpdate` (lithent/helper):**

대화 로그가 길어질 때 이전 메시지의 불필요한 re-render/diff를 방지.
`cacheUpdate`는 의존성이 변하지 않으면 캐싱된 VDom을 그대로 반환하여 diffing 자체를 건너뜀.

```tsx
import { cacheUpdate } from 'lithent/helper';

const ChatMessage = mount<MessageProps>(renew => {
  return cacheUpdate(
    (props) => [props.id, props.text, props.role],
    (props) => (
      <div class={`message ${props.role}`}>
        <strong>{props.role}:</strong> {props.text}
      </div>
    )
  );
});

// key + cacheUpdate 조합: 기존 메시지 = zero diff, 새 메시지만 렌더
{messages.map(m => <ChatMessage key={m.id} {...m} />)}
```

**Checklist:**

- [ ] Create `routes/chat.ts` with chat-specific surface (`chat:messages`, `chat:input`, `chat:typing`).
- [ ] Create `routes/chat/transitions/chat.ts`:
  - [ ] Yield full frame: user message + typing indicator.
  - [ ] Yield partial frames: bot 응답 토큰 누적 (simulated LLM stream).
  - [ ] Yield final partial: 완성된 응답 + typing 제거 (`removed`).
  - [ ] Yield `done`.
- [ ] Create chat templates:
  - [ ] `routes/chat/templates/chatMessages.tsx` — message list with `cacheUpdate` per message.
  - [ ] `routes/chat/templates/chatInput.tsx` — input form.
  - [ ] `routes/chat/templates/chatTyping.tsx` — typing indicator.
- [ ] Verify `abort previous` works as "cancel generation":
  - [ ] Send new message during bot streaming → previous stream cancels.
  - [ ] Only latest conversation state survives.
- [ ] Performance verification:
  - [ ] 100+ messages: old messages produce zero DOM mutations.
  - [ ] `cacheUpdate` dependency check confirms skip for unchanged messages.
- [ ] Update `pageHeader.tsx` nav with `/chat` link.
- [ ] Add tests:
  - [ ] Transition yields correct frame sequence (full → partial* → done).
  - [ ] Abort mid-stream produces clean state.
  - [ ] SSR initial render shows empty chat or welcome message.
- [ ] Smoke check: full chat flow works end-to-end in dev server.

### Phase 12: Engine/User Code Separation

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

| 개념 | 사용자가 하는 일 | 파일 위치 |
|------|----------------|-----------|
| **Surface** | HTML 문자열로 페이지 뼈대 + 앵커 선언 | `routes/*.ts` layout, `layouts/` |
| **Template** | TSX로 앵커 안 콘텐츠 정의 | `routes/**/templates/*.tsx` |
| **Transition** | async generator로 상태 프레임 yield | `routes/**/transitions/*.ts` |
| **Action** | 클라이언트에서 transition 호출 트리거 | `client/main.ts`, DOM event |

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
