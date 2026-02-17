
# **StateSurface**

> **A reference implementation of a state–layout mapping model.**

**Page navigation is MPA.**
Within a page, **DOM structure is synchronized to server-driven state streams.**

---

## 0. Implementation Risks (Priority Checklist)

Checked = design decision locked (still requires implementation validation).
Assumed by design = baseline requirement inherited from SSR + hydration.

**P0 — Core correctness**
* [x] `<h-state>` roots are stable anchors across SSR/CSR (`name` is the anchor)
* [x] SSR HTML and CSR VDOM structure match exactly (including text nodes) — Assumed by design
* [x] Initial hydration set matches the SSR state set (bootstrapped from server)
* [x] Hydration mismatch fallback defined (SSR hash → client render)
* [x] First post-hydration frame (first user action) does not cause remount/flicker

**P1 — Update accuracy**
* [x] Clear change-detection rule (server sends `changed`/`removed` per stream)
* [x] Data comparison strategy defined (no client compare) — Assumed by design
* [x] Removal policy for inactive states (default unmount, optional visibility)

**P2 — Stream/queue handling**
* [x] Queue backpressure policy (merge partials, full supersedes)
* [x] `done` / `error` frame handling defined
* [x] Frame ordering assumptions stated

**P3 — Module/bundling**
* [x] Template loading strategy decided (prebundle in v1)
* [x] Fallback when template load fails (error template)
* [x] Stable template ↔ module mapping in Vite (static registry)

**P4 — Performance/observability**
* [x] `<h-state>` update frequency within budget
* [x] Debug/tracing hooks for frame flow (single optional hook)
* [x] Optional dev UI to inspect `activeStates` (simple overlay)

**P5 — Implementation Details (must decide before coding)**
* [x] Frame transport format (NDJSON)
* [x] SSR `<h-state>` filling strategy (HTML parser)
* [x] SSR hash canonicalization (sha256 + normalized HTML)
* [x] Transition concurrency policy (abort previous)
* [x] `__STATE__` injection safety (JSON escaping/XSS rules)
* [x] Error template key convention (`system:error`)

**P6 — Implementation Clarity (must lock before coding)**
* [x] NDJSON frame schema fixed (required vs optional fields)
* [x] Full/partial and changed/removed precedence rule fixed
* [x] `system:error` anchor policy fixed (recommended)

**P7 — Routing**
* [x] Route discovery strategy decided (file-based, `routes/` directory)
* [x] Dynamic segment convention decided (`[param]` bracket syntax)
* [x] Route module contract defined (layout + transition + params)
* [x] SSR via transition reuse strategy decided (first full frame)
* [x] Layout composition pattern decided (shared base + per-route content)
* [x] Client entry is route-agnostic (discover + hydrate whatever is in DOM)

---

## 0. Purpose of This Document

This document exists to **freeze the core ideas of the project** so they are not lost or diluted over time.
Protocol-level examples and validation cases are documented in `PROTOCOL.md`.

### This is **not**:

* A complete framework spec
* A production architecture
* A promise of long-term maintenance

### This **is**:

* A **design record**
* An **executable mental model**
* A guide for building a **convincing prototype**
* A **reference others can re-implement better**

---

## 1. High-Level Philosophy

### 1.1 What This Is

**StateSurface is a state–layout mapping runtime.**

Implementation baseline:

* Backend: **Express-based**
* Frontend: **Lithent-based** rendering engine (from `skills/lithent`)
* Styling: **Tailwind CSS** — utility-first, surface와 template 모두에서 사용

Design intent:

* Inspired by **HTML_Template_Sigma**-style block replacement
* **If/logic minimized** in templates; state drives composition
* `<h-state>` anchors map **state → template → data**
* Rendering is intentionally split:
  * **Surface (HTML string)** declares page shell + `<h-state>` anchors
  * **Projection (TSX template)** renders inside each anchor

* The **server owns state**
* The **client owns DOM projection**
* HTML declares **existence conditions**, not behavior
* Views are **not programs**
* Views are **static surfaces selected by state**

User-facing concepts (the four things a developer defines):

| Concept | What | Where |
|---------|------|-------|
| **Surface** | Page shell with `<h-state>` anchors (string HTML) | `routes/*.ts` layout, `layouts/` |
| **Template** | Projection component inside each anchor (TSX) | `routes/**/templates/*.tsx` |
| **Transition** | Server-side state generator (async generator) | `routes/**/transitions/*.ts` |
| **Action** | Declarative trigger binding (HTML attributes) | `data-action` + `data-params` in templates |

> **Data streams define UI flow**

* Each frame in a transition stream carries **both state and data**
* The UI **progressively constructs itself** as frames arrive
* Views are paired with their data **at the frame level**

---

### 1.2 Intentional Asymmetry: Surface vs Projection

StateSurface intentionally does **not** unify everything into JSX.

* `surface.ts` (or `layouts/*.ts`) returns plain HTML strings.
* `routes/**/templates/*.tsx` contains projection components.
* `<h-state>` anchors are explicit in the surface, so SSR/CSR boundaries stay visible.
* TSX is used only for anchor-local rendering, not full-page shell authoring.

This asymmetry is a design choice, not an inconsistency:

* It preserves the "server state -> DOM surface" mental model.
* It avoids collapsing into page-component architecture (SPA/SSR framework style).
* It keeps route shell composition simple and string-first for SSR.

---

### 1.3 Authoring Guide: Surface vs Template Decision

The surface/projection split introduces two distinct authoring modes.
This section defines the decision boundary to minimize confusion.

**The single question:**

> **"Will this content change while the user stays on this page?"**
>
> * **No** → surface (static HTML string)
> * **Yes** → `<h-state>` anchor + template (TSX projection)

**What belongs in a surface:**

* Page skeleton and structural layout (`<main>`, `<footer>`, grid wrappers)
* Truly static content that never changes within a page lifetime (copyright, fixed headings)
* `<h-state>` anchor declarations (the slots themselves)

**What belongs in a template:**

* Any content driven by server state (articles, comments, search results)
* Navigation with active-state indicators (even if nav *looks* static, highlighting the current page requires data)
* Any content that could be updated by a transition stream

**Promotion path (surface → template):**

Content often starts static and later needs to become dynamic.
The intended migration is straightforward:

```
Before (surface):
  <footer>© 2026 StateSurface</footer>

After (promoted to template):
  <h-state name="page:footer"></h-state>
  + new template module for page:footer
```

This promotion is a **designed migration path**, not a refactoring failure.

**Rule of thumb:**

* Keep surfaces thin — structure and anchors only.
* When in doubt, use a template. Demoting a template back to surface is trivial
  (just inline the static HTML), but promoting surface to template requires
  creating a new template module and state key.
* A surface should read like a **wireframe**: slots and structure, no business content.

---

### 1.4 What This Is Not

❌ SPA framework
❌ Component system
❌ Template language
❌ HTML-over-the-wire (HTMX-style)

---

## 2. Navigation Model (MPA + File-Based Routing)

### 2.1 Page Navigation

Page navigation is **MPA with file-based route discovery**.

* Each URL maps to a **route module** in the `routes/` directory
* The server renders a **full HTML document per URL**
* Navigation between pages is a **full browser navigation**

```html
<a href="/article/1"> → full page load (server renders route)
```

---

### 2.2 Runtime Scope

The runtime only operates **within a page lifetime**.

* No client router
* No URL ↔ state syncing
* After page load, in-page updates come from **streamed transitions**

---

### 2.3 File-Based Route Discovery

Routes are defined by files in the `routes/` directory.
The server scans this directory at startup and registers Express routes automatically.

```
routes/
├── index.ts                      → GET /
├── guide/
│   └── [slug].ts                 → GET /guide/:slug
├── features/
│   ├── streaming.ts              → GET /features/streaming
│   └── actions.ts                → GET /features/actions
├── search.ts                     → GET /search
└── chat.ts                       → GET /chat
```

Routes also host per-page assets:

```
routes/
├── index/
│   └── templates/
│       ├── pageHero.tsx
│       ├── pageConcepts.tsx
│       └── pageFeatures.tsx
├── guide/
│   ├── [slug].ts
│   ├── templates/
│   │   ├── guideContent.tsx
│   │   └── guideToc.tsx
│   └── transitions/
│       └── guideLoad.ts
├── features/
│   ├── streaming.ts
│   ├── streaming/
│   │   ├── templates/
│   │   │   ├── demoControls.tsx
│   │   │   ├── demoTimeline.tsx
│   │   │   └── demoOutput.tsx
│   │   └── transitions/
│   │       └── streamDemo.ts
│   ├── actions.ts
│   └── actions/
│       ├── templates/
│       │   ├── actionsPlayground.tsx
│       │   └── actionsLog.tsx
│       └── transitions/
│           └── actionDemo.ts
├── search/
│   ├── templates/
│   │   ├── searchInput.tsx
│   │   └── searchResults.tsx
│   └── transitions/
│       └── search.ts
├── chat/
│   ├── templates/
│   │   ├── chatMessages.tsx
│   │   ├── chatInput.tsx
│   │   └── chatTyping.tsx
│   └── transitions/
│       └── chat.ts
└── _shared/
    └── templates/
        ├── pageHeader.tsx
        └── systemError.tsx
```

**Naming conventions:**

| File pattern | URL pattern | Example |
|---|---|---|
| `index.ts` | `/` (directory root) | `routes/index.ts` → `/` |
| `[param].ts` | `/:param` (dynamic segment) | `routes/article/[id].ts` → `/article/:id` |
| `name.ts` | `/name` (static segment) | `routes/search.ts` → `/search` |
| `dir/index.ts` | `/dir` (nested root) | `routes/admin/index.ts` → `/admin` |

**Convention rationale:** `[param]` bracket syntax is chosen over `_param` (underscore prefix)
because it is the most widely recognized convention (Next.js, SvelteKit, Nuxt, etc.).

---

### 2.4 Route-Level Surface Independence

Each route defines **only the `<h-state>` slots relevant to its own page purpose**.
A route's surface is its page identity — slots must not leak across pages.

**Principles:**

* A route's surface declares **exactly** the anchors that page needs — no more, no less.
* **Shared anchors** (`page:header`, `system:error`) come from shared layout helpers (`baseSurface`).
* **Page-specific anchors** are defined only in the route that uses them.
* No route should be a "catch-all" that includes slots from other pages.
* Each route's transitions yield frames targeting **only that page's slots**.

**Example — correct (each page has independent slots):**

```
GET /                    → page:hero, page:concepts, page:features
GET /guide/:slug         → guide:content, guide:toc
GET /features/streaming  → demo:controls, demo:timeline, demo:output
GET /features/actions    → actions:playground, actions:log
GET /search              → search:input, search:results
GET /chat                → chat:messages, chat:input, chat:typing
```

All pages share `page:header` and `system:error` via `baseSurface`.

**Anti-pattern — wrong (one page holds all slots):**

```
GET /  → guide:content, search:input, chat:messages  ← leaking
```

This project's route files should serve as a **well-structured site example**.
Each page stands alone; navigating between pages is a full MPA load
that brings a completely different surface and slot set.

#### Demo Site: Self-Documenting Feature Showcase

The project's demo pages double as **feature documentation**.
Each page's content explains the StateSurface concept it demonstrates —
users learn by reading the content while experiencing the feature in action.

| Route | Content | Demonstrated Features |
|-------|---------|----------------------|
| `/` | **StateSurface 소개** — 4 핵심 개념 카드, 각 기능 페이지 링크 | `initial` SSR only, surface 문자열 조합 |
| `/guide/[slug]` | **개념별 가이드** — surface, template, transition, action 문서 동적 로드 | Dynamic `[param]`, boot auto-run, full→partial 스트리밍 |
| `/features/streaming` | **스트리밍 데모** — 프레임 흐름 실시간 시각화, 버튼으로 직접 프레임 발사 | Full/partial frames, `removed`, error frame |
| `/features/actions` | **액션 플레이그라운드** — 버튼, 폼, scoped pending 직접 체험 | `data-action`, form submit, `data-pending-targets`, 다중 액션 |
| `/search` | **기능/개념 검색** — StateSurface 기능 목록에서 검색 | Form `data-action`, pending 상태 |
| `/chat` | **Q&A 챗봇** — StateSurface에 대해 질문하며 체험 | Abort previous, progressive streaming, cacheUpdate |

**Target slot structure:**

| Route | Page-specific slots | Shared (via baseSurface) |
|-------|--------------------|-----------------------------|
| `/` | `page:hero`, `page:concepts`, `page:features` | `page:header`, `system:error` |
| `/guide/[slug]` | `guide:content`, `guide:toc` | `page:header`, `system:error` |
| `/features/streaming` | `demo:controls`, `demo:timeline`, `demo:output` | `page:header`, `system:error` |
| `/features/actions` | `actions:playground`, `actions:log` | `page:header`, `system:error` |
| `/search` | `search:input`, `search:results` | `page:header`, `system:error` |
| `/chat` | `chat:messages`, `chat:input`, `chat:typing` | `page:header`, `system:error` |

**Feature coverage matrix:**

```
SSR + initial ─────────── all pages (especially /)
Surface composition ───── all pages
Template (TSX) ────────── all pages
Dynamic route [param] ─── /guide/[slug]
Boot auto-run ─────────── /guide/[slug]
Full frame ────────────── /guide/[slug], /features/streaming
Partial changed ───────── /guide/[slug], /features/streaming
Partial removed ───────── /features/streaming
Error frame ───────────── /features/streaming
data-action declarative ─ /features/actions, /search
Form submission ───────── /features/actions, /search
Pending state ─────────── /features/actions, /search
Scoped pending ────────── /features/actions
Multiple actions ──────── /features/actions
Abort previous ────────── /chat
Progressive streaming ─── /chat
cacheUpdate optimization─ /chat
Debug overlay ─────────── all pages (?debug=1)
i18n (ko/en) ─────────── all pages
basePath ─────────────── all pages (sub-path mounting)
```

#### i18n: Korean / English Bilingual Content

모든 데모 페이지는 **한국어(ko)와 영어(en)** 두 언어를 지원한다.
헤더에 언어 전환 버튼이 있고, 선택한 언어로 모든 콘텐츠가 표시된다.

**설계 원칙:**

* 언어 전환은 **transition** 으로 처리 — StateSurface 모델 그대로 활용.
  버튼 클릭 → `data-action="switch-lang"` → 서버가 해당 언어 콘텐츠로 full frame yield.
* 언어 상태는 **쿠키(`lang=ko|en`)** 에 저장 — MPA 네비게이션 시에도 유지.
* `initial(req)`에서 쿠키를 읽어 SSR 시점부터 올바른 언어로 렌더링.
* 콘텐츠 데이터는 `{ ko: ..., en: ... }` 구조로 서버에 보관.
  클라이언트는 언어를 알 필요 없음 — 서버가 선택한 언어의 데이터만 전송.

**시연 가치:**

* "서버가 상태를 소유한다"의 실전 사례 — 언어 선택은 서버 상태.
* 모든 페이지가 transition 한 번으로 전체 콘텐츠를 교체하는 full frame 활용 예시.
* `data-action` 선언적 바인딩의 자연스러운 확장.

**구현 범위:**

| 항목 | 설명 |
|------|------|
| 전환 버튼 | `page:header` 템플릿에 ko/en 토글 버튼 추가 |
| 전환 transition | `_shared/transitions/switchLang.ts` — 현재 라우트의 모든 슬롯을 해당 언어로 full frame |
| 쿠키 | `lang` 쿠키 (기본값 `en`, 유효값 `ko` \| `en`) |
| SSR | `initial(req)`에서 `req.cookies.lang` 읽어 해당 언어 데이터 반환 |
| 콘텐츠 | 각 route의 transition과 initial 데이터에 ko/en 버전 병렬 보관 |

#### Base Path: Sub-Path Mounting

기존 서비스(예: Java Spring 기반 `https://www.example.com`)의 **서브 경로**에
StateSurface 앱을 마운트할 수 있어야 한다.

```
https://www.example.com/state-surface/          → StateSurface 앱
https://www.example.com/state-surface/guide/surface
https://www.example.com/state-surface/transition/search   (POST)
```

Nginx 리버스 프록시 구성 예:
```nginx
location /state-surface/ {
    proxy_pass http://localhost:3000/;
}
```

**설계 원칙:**

* **Single source of truth** — `shared/basePath.ts` 모듈이 basePath를 중앙 관리.
  `setBasePath(path)`, `getBasePath()`, `prefixPath(url)` 헬퍼 제공.
* **Zero-cost default** — basePath가 `''`(빈 문자열)이면 현재와 완전히 동일하게 동작.
  기존 코드에 regression 없음.
* **환경변수 구동** — `process.env.BASE_PATH`로 설정.
  `BASE_PATH=/state-surface pnpm dev`로 즉시 서브 경로 모드 활성화.
* **서버→클라이언트 전달** — SSR HTML에 `<script id="__BASE_PATH__">` JSON 태그 삽입.
  클라이언트 부트스트랩 시 읽어서 `setBasePath()` 호출 + `StateSurface` 인스턴스에 전달.

**영향 범위:**

| 레이어 | 영향받는 부분 | 적용 방식 |
|--------|-------------|----------|
| 서버 라우트 | `app.get()`, `app.post('/transition/:name')` | `prefixPath(urlPattern)` |
| 클라이언트 fetch | `fetch('/transition/${name}')` | `StateSurfaceOptions.basePath` |
| 레이아웃 에셋 | `<script src="/client/main.ts">` | `prefixPath(clientEntry)` |
| 콘텐츠 href | `shared/content.ts`의 모든 href | `prefixPath(href)` |
| 템플릿 href | pageHeader, guideToc 등의 네비게이션 링크 | `prefixPath(href)` |
| 쿠키 Path | `lang` 쿠키의 `Path=/` | `Path=${basePath \|\| '/'}` |
| Vite | 에셋 번들 경로 | `vite.config.ts`의 `base` 옵션 연동 |

**시연 가치:**

* 실전 배포 시나리오 — 대부분의 프레임워크가 `basePath`/`base` 옵션을 제공하는 이유.
* StateSurface 데모 사이트 자체도 서브 경로로 배포 예정.
* MPA + NDJSON 스트리밍 모델에서 basePath가 올바르게 전파되는 것을 검증.

---

### 2.5 Route Module Contract

Each route file exports a **RouteModule** object:

```ts
import type { RouteModule } from 'state-surface/server';

export default {
  // Surface function (RouteModule field name remains `layout`)
  // Returns full HTML document string and embeds stateScript
  layout(stateScript: string): string { ... },

  // Name of the transition to stream on user actions
  transition: 'article-load',

  // Extract transition params from Express request
  params(req: Request): Record<string, unknown> {
    return { articleId: Number(req.params.id) };
  },

  // Optional: SSR base state (used before any transition)
  initial(req: Request) {
    return {
      'page:header': { title: 'Blog', nav: 'article' },
      'page:content': { loading: false, articleId: Number(req.params.id) },
    };
  },

  // Optional: auto-run transition after hydration (SSR → immediate streaming)
  boot: {
    auto: true,
    params: (req: Request) => ({ articleId: Number(req.params.id) }),
  },
} satisfies RouteModule;
```

**Required fields:**

* `layout` — Surface function returning full HTML document string
  (with `<h-state>` anchors and embedded `stateScript`).
  Recommended implementation: compose shared string helpers from `surface.ts`.

**Optional fields:**

* `transition` — Name of a registered transition (required if the route uses streaming actions)
* `params` — Extracts transition params from request (defaults to `{}`)
* `initial` — Returns SSR base state (if omitted, SSR falls back to transition’s first full frame)
* `boot` — Auto-run transition on the client after hydration (`auto: true`)

---

### 2.6 SSR Initial State Resolution

SSR chooses the initial state in the following order:

1. If `route.initial` exists, use it.
2. Otherwise, if `route.transition` exists, run the transition and collect the **first full frame**
   (`type: 'state'`, `full !== false`).
3. If neither exists, render with empty anchors and no `__STATE__` bootstrap.

If `initial` is missing and the transition’s first frame is **not** full, SSR responds with an error.
Partial frames require a baseline state and are invalid for SSR bootstrapping.

```ts
async function getInitialStates(route: RouteModule, req: Request) {
  if (route.initial) return await route.initial(req);

  if (!route.transition) return {};
  const params = route.params?.(req) ?? {};
  const handler = getTransition(route.transition);
  const gen = handler(params);
  const { value } = await gen.next();

  if (value?.type === 'state' && value.full !== false) return value.states;
  throw new Error('SSR requires a full first frame when initial is missing');
}
```

**Default behavior remains transition reuse**, but `initial` allows explicit SSR control.
If `boot.auto` is enabled, the server embeds boot config and the client
auto-calls the route transition immediately after hydration.

---

### 2.7 Surface Composition

```ts
// layouts/surface.ts — shared string helpers
export function stateSlots(...names: string[]): string {
  return names.map((name) => `<h-state name="${name}"></h-state>`).join('\n');
}

export function joinSurface(...blocks: Array<string | undefined>): string {
  return blocks.filter(Boolean).join('\n');
}

export function baseSurface(body: string, stateScript: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>StateSurface</title></head>
<body>
  <h-state name="page:header"></h-state>
  ${body}
  <h-state name="system:error"></h-state>
  ${stateScript}
  <script type="module" src="/client/main.ts"></script>
</body>
</html>`;
}

// routes/article/[id].ts — route-level surface + initial + boot
import { baseSurface, joinSurface, stateSlots } from '../../layouts/surface.js';

const articleBodySurface = () =>
  joinSurface(
    '<main class="page">',
    stateSlots('page:content', 'panel:comments'),
    '</main>'
  );

export default {
  layout: (stateScript) => baseSurface(articleBodySurface(), stateScript),
  transition: 'article-load',
  params: req => ({ articleId: Number(req.params.id) }),
  initial: req => ({
    'page:header': { title: 'Blog', nav: 'article' },
    'page:content': { loading: false, articleId: Number(req.params.id) },
  }),
  boot: { auto: true, params: req => ({ articleId: Number(req.params.id) }) },
};
```

**The client entry point is route-agnostic.**
All templates are prebundled (Section 6.8). The client discovers whatever `<h-state>` anchors
are in the DOM and hydrates them. No per-route client configuration is needed.

---

## 3. State Model

### 3.1 State Is a Map, Not a Single Value

The current UI condition is represented as a **map of template → data**:

```js
activeStates = {
  "page:article:view": { articleId: 1 },
  "panel:comments:open": { articleId: 1, page: 1 }
}
```

States:

* Are opaque template names
* Have no hierarchy semantics
* Are matched by **exact name only**
* Carry **data bound to each template**

---

### 3.2 State Transitions

State changes are driven by **server-side transitions**, not client logic.

A transition:

* Is invoked by the client
* Is executed on the server
* Emits a **stream of state frames**

> **Full frames declare the complete UI state; partial frames declare changes**

---

### 3.3 Transition Registration (Auto-Discovery)

Transitions are auto-registered by scanning `routes/**/transitions/` at startup.
Each module exports a **TransitionModule** via `defineTransition(name, handler)`.
No manual registry calls are required in `server/index.ts`.

```ts
import { defineTransition } from '../server/transition.js';

export default defineTransition('article-load', async function* (params) {
  // yield StateFrame objects
});
```

---

### 3.4 Actions (Client → Server Trigger)

An **action** is the bridge between user intent on the client and a transition on the server.

Transitions define *what happens* (server state generator).
Actions define *when it happens* (user interaction trigger).

#### 3.4.1 Declarative Action Binding

Actions are declared in templates via HTML attributes — no imperative JS required:

```tsx
<button
  data-action="article-load"
  data-params='{"articleId": 1}'
>
  Load Article
</button>
```

* `data-action` — the transition name to invoke
* `data-params` — JSON-serialized params to send (optional, defaults to `{}`)

The engine auto-discovers `[data-action]` elements and wires click/submit handlers.
Users never call `surface.transition()` directly in application code.

#### 3.4.2 Why Declarative

* **Template is the single source of truth** — reading a template shows both
  what it renders *and* what actions it can trigger.
* **No JS event wiring in user code** — the engine handles delegation.
* **Consistent with the philosophy** — "HTML declares existence conditions."
  `data-action` declares "this element can trigger a state change."

#### 3.4.3 Action Discovery (Engine)

The engine uses a single delegated event listener on `document`:

```js
document.addEventListener('click', e => {
  const el = (e.target as Element).closest('[data-action]');
  if (!el) return;
  const action = el.getAttribute('data-action')!;
  const params = JSON.parse(el.getAttribute('data-params') ?? '{}');
  surface.transition(action, params);
});
```

No per-element binding. Works with SSR-rendered and CSR-rendered elements alike.
Form submission (`<form data-action="...">`) is handled similarly via `submit` event.

#### 3.4.4 Pending State (Transition In-Flight)

When a transition is in flight (between action trigger and first frame arrival),
the engine marks affected `<h-state>` anchors with a `data-pending` attribute:

```
User clicks [data-action] → engine adds data-pending to anchors
→ first frame arrives → engine removes data-pending
→ error/abort → engine removes data-pending
```

CSS handles visual feedback and interaction blocking:

```css
h-state[data-pending] {
  opacity: 0.5;
  pointer-events: none;
  transition: opacity 0.15s;
}
```

**Pending scope:**

* Default: **all anchors** are marked pending (most transitions replace full state).
* Optional: `data-pending-targets` on the action element limits which anchors are marked.

```tsx
<button
  data-action="load-comments"
  data-params='{"articleId": 1}'
  data-pending-targets="panel:comments"
>
  Load Comments
</button>
```

If `data-pending-targets` is present, only the listed anchors receive `data-pending`.
Multiple targets are comma-separated: `"panel:comments,page:content"`.

#### 3.4.5 Action Lifecycle

```
[User clicks button with data-action]
  ↓
[Engine reads data-action, data-params]
  ↓
[Engine aborts previous in-flight transition]
  ↓
[Engine adds data-pending to target anchors]
  ↓
[Engine calls POST /transition/:name with params]
  ↓
[First NDJSON frame arrives]
  ↓
[Engine removes data-pending from anchors]
  ↓
[Frames apply to activeStates as usual]
  ↓
[done frame → stream ends]
```

---

## 4. Transport Model (State Streams)

### 4.1 Default Transport

* HTTP `POST` + `ReadableStream`
* **NDJSON** (`application/x-ndjson`)
* One stream per transition
* Streams are ephemeral

```
transition request
→ state frames
→ done
→ connection closes
```

---

### 4.2 Why Not WebSocket by Default

* Persistent connections are expensive
* Most UI transitions are short-lived
* WebSocket is reserved for **optional long-lived subscriptions**
  (e.g. notifications)

---

## 5. Frame Model

A transition emits a **sequence of frames**:

```ts
type StateFrame =
  | {
      type: "state";
      states: Record<string, any>;
      full?: boolean;
      changed?: string[];
      removed?: string[];
    }
  | { type: "error"; message?: string; template?: string; data?: any }
  | { type: "done" }
```

For concrete valid/invalid payload samples, see `PROTOCOL.md`.

**Important principles:**

* Frames describe **what is**, not what to do
* The client **never computes state**
* **Full frames replace state; partial frames merge by template key**
* **State and data flow together**
* **Views are bound to data at the frame level**
* Frames are **processed as a FIFO queue**
* The **last frame** becomes the final `activeStates`
* Updates are **data-only**; templates are already on the client
* The **first frame** is full when starting without a baseline (SSR fallback)

---

### 5.1 Progressive UI Construction

Frames arrive in sequence, and the UI constructs itself progressively.

#### Server-side transition

```ts
async function* articleTransition(articleId) {
  yield {
    type: "state",
    states: {
      "page:article": { articleId },
      "loading": { articleId }
    }
  }

  const article = await db.getArticle(articleId)
  yield {
    type: "state",
    states: {
      "page:article": { articleId },
      "content:loaded": { article }
    }
  }

  const comments = await db.getComments(articleId)
  yield {
    type: "state",
    states: {
      "page:article": { articleId },
      "content:loaded": { article },
      "comments:loaded": { comments }
    }
  }

  yield { type: "done" }
}
```

#### Client-side views

```html
<h-state name="loading">
  <div class="spinner">Loading article...</div>
</h-state>

<h-state name="content:loaded">
  <article>
    <h1>{article.title}</h1>
    <p>{article.body}</p>
  </article>
</h-state>

<h-state name="comments:loaded">
  <section class="comments">
    <h2>Comments</h2>
    {comments}
  </section>
</h-state>
```

#### UI Flow

1. Frame 1 → loading appears
2. Frame 2 → article content replaces loading
3. Frame 3 → comments appear below

---

### 5.2 State Combinations Express Complex UI

```ts
async function* searchTransition(query) {
  yield {
    type: "state",
    states: {
      "search:input": { query }
    }
  }

  const cached = cache.get(query)
  if (cached) {
    yield {
      type: "state",
      states: {
        "search:input": { query },
        "results:cached": { results: cached }
      }
    }
  }

  const live = await api.search(query)
  yield {
    type: "state",
    states: {
      "search:input": { query },
      "results:live": { results: live }
    }
  }
}
```

```html
<h-state name="search:input">
  <input value="{query}" />
</h-state>

<h-state name="results:cached">
  <div class="results cached">{results}</div>
</h-state>

<h-state name="results:live">
  <div class="results live">{results}</div>
</h-state>
```

**No loading flags.
No cache invalidation logic.
The stream defines the entire flow.**

---

### 5.3 Full vs Partial Frames

* **Full frame**: `states` includes **all active templates**
* **Partial frame**: `states` includes **only changed templates**
* Partial frames **merge by template key**
* `removed` lists templates that must be unmounted
* **The first frame in a stream must be full**
* If `full` is omitted, it is treated as **true**

Schema rules (NDJSON state frames, v1):

* `type` is required and must be `"state"`
* `states` is required and must be an object
* `full` is optional (default `true`)
* If `full === false`, at least one of `changed` or `removed` is required
* If `full === false` and `changed` exists, changed keys must exist in `states`
* If `full === false`, `removed` keys must not exist in `states`
* `removed` may be empty; delete-only partials are valid (`states` can be `{}`)

Precedence rules (v1):

* If `full !== false`, treat the frame as full and ignore `changed`/`removed`
* If `full === false`, apply `removed` first, then apply `changed` via `states`
* A key cannot exist in both `removed` and `changed`; if it does, frame is invalid

Client apply rule:

```js
if (frame.full) {
  activeStates = frame.states
} else {
  for (const key in frame.states) activeStates[key] = frame.states[key]
  for (const key of frame.removed || []) delete activeStates[key]
}
```

---

### 5.4 Frame Queue (Sequential Processing)

An action produces **a queue of StateFrames**.

* Frames are processed **in order**
* **Full frames** replace `activeStates`
* **Partial frames** merge by template key
* When the queue ends, the **last frame is the final state**
* **No skippable frames** in v1
* If the queue lags, **merge consecutive partial frames** (last write wins)
* When a **full frame** arrives, it **supersedes any pending partials**

Partial merging is a **delayed apply** strategy to keep UI responsive.

---

### 5.5 Change Detection (Stateless Streams)

The server is **stateless across requests** and stateful **only within a stream**.

* Each request produces a self-contained stream
* The server tracks **previous frame** only inside that stream
* It emits `changed` / `removed` keys per frame
* The client updates **only those keys**

Example:

```json
{
  "type": "state",
  "states": {
    "page:article:view": { "article": { "id": 1 } },
    "panel:comments:open": { "comments": [] }
  },
  "changed": ["page:article:view"],
  "removed": []
}
```

---

### 5.6 Error and Done Frames

Errors are **user-defined**. The server decides what to send in an error frame.

If an error template exists in the layout, it can be rendered; otherwise the
stream ends.

Error template key convention (v1):

* Reserved key: **`system:error`**
* Anchor policy: **recommended**, not required
* Recommended anchor in layout: `<h-state name="system:error"></h-state>`

```json
{ "type": "error", "template": "system:error", "data": { "message": "..." } }
```

Client handling:

* If `template` is present **and** a matching `<h-state>` exists, render it as a
  **full frame**:
  `{ states: { "system:error": { ...data } }, full: true }`
* Otherwise, **stop processing** and surface the error (log/callback)

`done` indicates **end of stream**. The client should:

* Flush remaining queued frames
* Ignore any frames received after `done`

**Ordering assumption:** HTTP stream order is preserved; no reordering logic is required.

---

### 5.7 Transition Concurrency

Concurrency policy is **abort previous**.

* Starting a new transition cancels the previous in-flight stream
* Only the latest user intent continues to update UI
* Canceled streams must not apply further frames

---

## 6. View Model

### 6.1 `<h-state>` Elements

HTML declares **state-bound layout fragments**:

```html
<h-state name="page:article:view">
  <article>
    <h1>{title}</h1>
  </article>
</h-state>
```

Rules:

* No `if`
* No `for`
* No expressions
* No JS
* `name` must match a **template key** in `activeStates`
* The template uses **only the data bound to its own key**

---

### 6.2 Structural Synchronization (Default)

* State active → element exists in DOM
* State inactive → element removed
* **Default policy: unmount inactive templates**

This keeps:

* Accessibility correct
* DOM truthful

---

### 6.3 Optional Visibility Mode

```html
<h-state name="panel:comments" mode="visibility">
```

* Hide/show instead of mount/unmount
* Intended for animations or local state preservation
* Use only when focus/scroll/local state must survive

---

### 6.4 Hydration Boundaries

`<h-state>` is the smallest hydration unit.

* **Do not hydrate the whole page**
* **Each active `<h-state>` is hydrated independently**
* After hydration, updates are **data-driven re-renders** of that template

---

### 6.5 Example: Surface + Templates (SSR → Hydration)

Page surface **declares `<h-state>` anchors only** (string HTML):

```ts
export function articleSurface(stateScript: string): string {
  return `<!DOCTYPE html>
<html>
<body>
  <header class="site-header">StateSurface</header>

  <main class="page">
    <h-state name="page:article:view"></h-state>
    <h-state name="panel:comments:open"></h-state>
  </main>

  <footer class="site-footer">©2026</footer>
  ${stateScript}
  <script type="module" src="/client/main.ts"></script>
</body>
</html>`;
}
```

Projection templates render **inside** each `<h-state>`:

```tsx
export function ArticleView({ article }) {
  return (
    <article>
      <h1>{article.title}</h1>
      <p>{article.body}</p>
    </article>
  )
}
```

Server fills anchors using template → data:

```js
const html = renderLayout()
const states = {
  "page:article:view": { article },
  "panel:comments:open": { comments }
}

const filled = fillHState(html, states)
```

fillHState sketch (HTML parser-based):

```js
function fillHState(html, states) {
  const dom = parseHTML(html)

  for (const el of dom.querySelectorAll('h-state[name]')) {
    const key = el.getAttribute('name')
    const data = states[key]

    if (!data) {
      el.innerHTML = ''
      continue
    }

    const Comp = templates[key]
    const inner = renderToString(h(Comp, data))
    el.innerHTML = inner
  }

  return serializeHTML(dom)
}
```

Initial state bootstrapping:

* The server **embeds the initial `activeStates`** in HTML
* The client **hydrates from that exact payload**
* After hydration, new states are applied **only in browser memory**

Example:

```html
<script id="__STATE__" type="application/json">
{"page:article:view":{"article":{"title":"..."}}}
</script>
```

```js
const initialStates = JSON.parse(
  document.getElementById('__STATE__').textContent
)
stateSurface.hydrate(initialStates)
```

`__STATE__` injection safety (v1):

* Serialize with `JSON.stringify`
* Escape `<`, `>`, `&`, `\u2028`, `\u2029` before embedding in HTML
* Read with `textContent` and parse with `JSON.parse`
* Do not include secrets/tokens in `__STATE__`

Example:

```js
function safeStateJSON(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}
```

Client hydrates **per `<h-state>` root**:

```js
for (const el of document.querySelectorAll('h-state[name]')) {
  const key = el.getAttribute('name')
  hydration(buildVDOM(key, activeStates[key]), el)
}
```

---

### 6.6 Hydration Mismatch Fallback (SSR Hash)

If hydration cannot be trusted, fall back to **client render** for that `<h-state>`.

Server embeds a hash of the SSR HTML for each anchor:

```html
<h-state name="page:article:view" data-ssr-hash="7e3a...">...</h-state>
```

Hash canonicalization rules (v1):

* Algorithm: **sha256**
* Normalize whitespace (collapse runs, trim edges)
* Sort attributes by key before hashing
* Exclude HTML comments from hash input
* Exclude dynamic attributes (e.g. nonce/timestamps) from hash input

Client compares the expected HTML hash and decides:

```js
const expected = renderToString(buildVDOM(key, activeStates[key]))
const expectedHash = hash(expected)
const ssrHash = el.getAttribute('data-ssr-hash')

if (ssrHash && expectedHash !== ssrHash) {
  el.innerHTML = ''
  render(buildVDOM(key, activeStates[key]), el)
} else {
  hydration(buildVDOM(key, activeStates[key]), el)
}
```

This keeps failure recovery **scoped to the `<h-state>` root**.

---

### 6.7 First Post-Hydration Frame

After hydration, **no automatic state change occurs** unless `boot.auto` is enabled.

The first state frame is expected to arrive **only after user interaction**.
At that moment:

* Only changed `<h-state>` roots update
* Unchanged roots are untouched (no remount/flicker)

This guarantees a stable UI immediately after hydration.

---

### 6.8 Template Loading Strategy (v1)

Templates are **prebundled** into the client build.

* No runtime template fetching
* A **template registry** maps `name → module`
* Templates are auto-registered from `routes/**/templates/**/*.tsx`
* SSR uses the same registry (Vite SSR in dev, built modules in prod)
* Lazy loading is **out of scope for v1**
* Templates are authored as **TSX components** (Lithent JSX runtime) and compiled by Vite
* Surface composition remains **plain TypeScript string builders** (`surface.ts`, `layouts/*.ts`)

---

### 6.8.1 Template Authoring (Projection, Stateless by Default)

Templates are projection modules. Keep full-page shell in surface files (`*.ts`, string-based).
Templates should be **pure, stateless components** by default. StateSurface owns state on the server;
templates only project data into DOM. Avoid local state unless it is strictly **client-only UI state**
(focus, caret position, scroll, measurements).

* Prefer top-level, reusable functions (no per-render function creation).
* Lithent passes `children` as the **second** argument: `(props, children)`.
* Use `mount` / `lmount` **only** when local state is unavoidable.
* Each template file default-exports `defineTemplate(name, Component)`.

Example:

```tsx
export const Badge = ({ label }: { label: string }) => <span>[{label}]</span>;

export const Card = ({ title }: { title: string }, children: JSX.Element) => (
  <div>
    <Badge label="Info" /> {title}
    {children}
  </div>
);
```

---

### 6.9 Template Load Fallback

If a template module is missing or fails to load:

* Render the **error template** (if defined in layout)
* Otherwise, leave the `<h-state>` empty and log the issue

This keeps failures localized to a single template.

---

### 6.10 Template Registry (Static)

Template names map to modules via a **static registry** shared by SSR and CSR.

```ts
export const templates = {
  "page:article:view": ArticleView,
  "panel:comments:open": CommentsPanel
}
```

This registry is the **single source of template mapping truth**.
Template modules are TSX files (for example, `routes/article/templates/ArticleView.tsx`).

---

## 7. No Nested States

### 7.1 No Structural Nesting

* `<h-state>` elements **must not be nested**
* Nesting implies structural coupling, which this model rejects
* **Multiple states may be active simultaneously**
* The DOM reflects **all active states at once**

---

### 7.2 File-Level Chunking

Each file defines a **single template component** (TSX), not a page bundle.

```
views/
├─ page.article.tsx
├─ panel.comments.tsx
```

Fragments are composed at runtime via **slots**, not imports.

---

## 8. Data Binding

### 8.1 Simple Hole Substitution

```html
<h1>{title}</h1>
```

Rules:

* Key lookup only
* No expressions
* No formatting logic
* Data comes from the **current frame**

---

### 8.2 Data Scope

Full frames carry **complete data for all active states**.
Partial frames carry **data only for changed templates**.

```ts
yield {
  type: "state",
  states: {
    "page:article": { article: {...} },
    "panel:comments": { comments: [...] }
  }
}
```

**Binding rule:**
Template name → bound data (by convention)

---

### 8.3 Lists by Data Shape

If bound data is an array, the runtime repeats the node.

```html
<h-state name="comments:loaded">
  <div class="comment">
    <p>{author}</p>
    <p>{text}</p>
  </div>
</h-state>
```

No loop syntax.
Repetition is a **property of data**, not templates.

---

## 9. Runtime Responsibilities

The client runtime:

* Receives frames
* Updates `activeStates`
* Selects matching `<h-state>` fragments
* Projects data
* Applies minimal DOM changes
* **Processes frames sequentially (queue)**
* Hydrates **per `<h-state>`**, not per page
* Updates **only changed templates**
* Handles `error` and `done` frames
* Exposes a **single debug hook** for frame flow

---

### 9.1 Minimal Runtime Core

```js
class StateSurface {
  activeStates = {}
  frameQueue = []
  instances = {}
  maxQueue = 20
  frameBudgetMs = 33

  async transition(name, params) {
    const res = await fetch(`/transition/${name}`, {
      method: "POST",
      body: JSON.stringify(params)
    })

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const frame = JSON.parse(decoder.decode(value))

      if (frame.type === "state") {
        this.frameQueue.push(frame)
        this.scheduleFlush()
      }
    }
  }

  scheduleFlush() {
    if (this.flushScheduled) return
    this.flushScheduled = true
    requestAnimationFrame(() => {
      this.flushScheduled = false
      this.flushQueue()
    })
  }

  flushQueue() {
    const start = performance.now()
    while (this.frameQueue.length > 0) {
      if (performance.now() - start > this.frameBudgetMs) break

      if (this.frameQueue.length > this.maxQueue) {
        this.dropToNextFull()
      }

      let frame = this.frameQueue.shift()
      if (frame.type !== "state") continue

      if (frame.full === false) {
        frame = this.coalescePartials(frame)
      }

      this.applyFrame(frame)
    }
  }

  dropToNextFull() {
    const idx = this.frameQueue.findIndex(
      f => f.type === "state" && f.full !== false
    )
    if (idx > 0) this.frameQueue = this.frameQueue.slice(idx)
  }

  coalescePartials(first) {
    let merged = { ...first }
    while (
      this.frameQueue[0] &&
      this.frameQueue[0].type === "state" &&
      this.frameQueue[0].full === false
    ) {
      const next = this.frameQueue.shift()
      merged = {
        type: "state",
        full: false,
        states: { ...merged.states, ...next.states },
        removed: [
          ...new Set([...(merged.removed || []), ...(next.removed || [])])
        ],
        changed: [
          ...new Set([...(merged.changed || []), ...(next.changed || [])])
        ]
      }
    }
    return merged
  }

  applyFrame(frame) {
    if (frame.full !== false) {
      const removed = Object.keys(this.activeStates).filter(
        key => !(key in frame.states)
      )
      this.sync(frame.states, Object.keys(frame.states), removed)
      return
    }

    const nextStates = { ...this.activeStates, ...frame.states }
    for (const key of frame.removed || []) delete nextStates[key]
    this.sync(nextStates, frame.changed || Object.keys(frame.states), frame.removed)
  }

  sync(nextStates, changedKeys, removedKeys) {
    const prevStates = this.activeStates

    // remove inactive templates
    for (const key of removedKeys || []) this.unmount(key)

    // update changed templates
    for (const key of changedKeys || []) {
      if (!this.instances[key]) this.hydrate(key, nextStates[key])
      else this.update(key, nextStates[key])
    }

    this.activeStates = nextStates
  }
}
```

---

### 9.2 Lithent Integration

Lithent is used **only as a diffing engine**.

```js
sync() {
  const vdom = this.buildVDOM()
  lithentPatch(this.root, vdom)
}
```

* Hydration is applied **per `<h-state>` root**
* After hydration, updates are **patches on that root**
* No component API exposed
* Lithent is invisible
* **Just a DOM diff utility**

---

### 9.3 Debug/Tracing Hook

A single optional hook is exposed for **frame flow logging**.

```js
stateSurface.trace = event => {
  // forward to server logs or console
  console.log(event)
}
```

Recommended events:

* `received` (queue size)
* `applied` (full/partial)
* `merged` (partial coalesced)
* `dropped` (queue trimmed)
* `error` / `done`

---

### 9.4 Dev Overlay (Optional)

A minimal debug overlay can render the current `activeStates`.

* Toggled by query flag (e.g. `?debug=1`)
* Shows active template keys and current data snapshot
* Disabled by default in production builds

---

## 10. Composition & Customization

### 10.1 States as Extension Points

New behavior is introduced by **adding states**, not logic.

Examples:

* `page:article:view + role:admin`
* `page:article:view + mode:editing`

---

### 10.3 Performance Budget

Default update budget (v1):

* **Target 30fps** (≈33ms per frame)
* Apply at most **one queue flush per animation frame**
* Merge partials when queue grows; full frames supersede
* Raise budget only for lightweight templates

This keeps update cost predictable while preserving responsiveness.

---

### 10.2 Packs (Optional)

```
article/
├─ templates/
│  └─ pageContent.tsx
└─ transitions/
   └─ articleLoad.ts
```

* Optional
* Non-semantic
* Invisible to runtime

---

## 11. End-to-End Example

(… 내용 동일, 구조 유지 …)

---

## 12. Prototype Scope

### Must demonstrate

* `<h-state>` DOM sync
* HTTP streamed transitions
* Progressive UI construction
* Frame-level data/state pairing

### Must not include

* Plugins
* Auth
* Error recovery
* Optimizations

---

## 13. Success Criteria

This succeeds if:

* The idea is understandable by **reading HTML**
* The demo feels **“weird but convincing”**
* Others can re-implement it independently
* A full flow is shown in **under 50 lines**

---

## 14. Guiding Sentences

> **Features are not implemented. They are composed by adding states.**

> **Data flows define UI flows. The stream is the state machine.**

> **The client is a dumb terminal. The server owns all logic.**
