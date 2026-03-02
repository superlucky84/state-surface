# StateSurface Phase 2 — 프로덕션 프레임워크 릴리스

Phase 1(`IMPLEMENT.md`, 동결)의 미완료 항목 + 프로덕션 프레임워크 전환 + 오픈소스 배포를 통합 정리한다.
아키텍처 설계는 `DESIGN_PHASE2.md`에 정의. 이 문서는 **실행 체크리스트**.
배포 모델은 **코어 패키지(`state-surface`) + CLI 스캐폴딩(`create-state-surface`) 분리**.
CLI는 신규 생성 전용으로 사용하고, 기존 프로젝트 업데이트는 패키지 업그레이드로 처리한다.

읽기 순서: `DESIGN.md` → `PROTOCOL.md` → `DESIGN_PHASE2.md`(설계) → **이 파일**(실행).

---

## Open Decisions

미해결 설계 결정. 해당 Phase 착수 전에 확정하고 근거를 기록한다.

- [x] **DC-01** 라이선스 선택: **MIT** 확정
- [x] **DC-02** 프로덕션 서버 빌드 방식: **Vite SSR 빌드** 확정 (`vite build --ssr`) → `DESIGN_PHASE2.md` §3
- [x] **DC-03** 설정 파일 도입 여부: **환경 변수만** 확정 (설정 파일은 Phase 2 이후 필요 시 도입) → `DESIGN_PHASE2.md` §7.1
- [ ] **DC-04** E2E 테스트 도구: Playwright(A) vs Cypress(B) vs 생략(C) — TBD (Phase 2-14 착수 전 확정)
- [x] **DC-05** 업데이트 경로: **재스캐폴딩 금지, 패키지 업그레이드 우선** (`pnpm up state-surface`) 확정 → `DESIGN_PHASE2.md` §6.4

---

## Phase 2-1: Public API 퍼사드 + Import Alias ✅

사용자 코드에서 `../../../../engine/shared/protocol.js` 같은 상대경로를 제거한다.
`state-surface` alias 하나로 모든 engine public API에 접근하게 한다.

**Entry**: engine/ 디렉토리 구조 확정 (Phase 1 완료 상태).
**Exit**: 모든 사용자 파일(`routes/`, `layouts/`, `shared/`)에서 engine import가 `'state-surface'`로 통일.

### 퍼사드 barrel
- [x] `engine/index.ts` 생성 — public API re-export:
  - `defineTemplate` (from `./shared/templateRegistry.js`)
  - `defineTransition` (from `./server/transition.js`)
  - `prefixPath`, `getBasePath` (from `./shared/basePath.js`)
  - `type RouteModule` (from `./shared/routeModule.js`)
  - `type StateFrame` (from `./shared/protocol.js`)
- [x] public API 외의 engine 내부 모듈은 barrel에 포함하지 않음 (경계 명확화).

### Alias 설정
- [x] `tsconfig.json` — `paths` 에 `"state-surface": ["./engine/index.ts"]` 추가.
- [x] `vite.config.ts` — `resolve.alias`에 `state-surface` → `engine/index.ts` 추가.
- [x] `vitest.config.ts` — `resolve.alias` 추가 (테스트 환경).
- [x] `package.json` — `exports` self-reference 추가 (tsx 서버 환경).

### 사용자 코드 마이그레이션
- [x] `routes/**/*.ts`, `routes/**/*.tsx` — 상대경로 engine import를 `'state-surface'`로 일괄 변경.
- [x] `layouts/*.ts` — 동일 변경.
- [x] `shared/*.ts` (코드 import만, 가이드 콘텐츠 내 코드 예시 문자열은 별도) — 동일 변경.
- [x] `shared/content.ts` 내 가이드 코드 예시 문자열에서도 import 경로를 `'state-surface'`로 변경.

### Baseline 테스트
- [x] `pnpm test` 전체 통과 (기존 347개 테스트 회귀 없음).
- [ ] `pnpm dev` 실행 후 최소 1개 route SSR + 1개 transition NDJSON 응답 확인.
- [x] engine 내부 모듈 간 import는 상대경로 유지 (alias 미적용) 확인.

---

## Phase 2-1.5: 가이드 코드 블록 UX 개선 ✅

가이드 페이지의 코드 비교 섹션에서 React 예제가 30~60줄로 화면을 점유해 StateSurface 코드의 간결함이 묻힌다.
소제목으로 구분감을 주고, React 비교 코드는 접어서 필요할 때만 펼쳐보게 한다.

**Entry**: Phase 2-1 완료.
**Exit**: 가이드 페이지에서 React 비교 코드가 `<details>`로 접혀있고, 코드 블록 간 소제목 구분이 명확.

### 콘텐츠 모델 확장
- [x] `Block` 타입에 `collapsible?: boolean` 플래그 추가 (`shared/content.ts`의 code 블록 타입).
- [x] React 비교 코드 블록(`label`에 `✗` 포함)에 `collapsible: true` 적용 (en/ko 양쪽, 8개).

### 렌더러 수정
- [x] `guideContent.tsx`의 `CodeBlock` — `collapsible` 일 때 `<details>/<summary>`로 감싸기.
  - `<summary>`에 label 표시, 화살표 아이콘 포함, open 시 rotate-90 애니메이션.
  - 펼침/접힘 전환 애니메이션 (CSS `grid-template-rows` 트랜지션).
- [x] `CodeBlock`의 `label`을 시각적으로 강조된 서브헤딩 스타일로 변경.
  - ✓ label: emerald-600 font-semibold (StateSurface 예제)
  - ✗ label: red-400 font-semibold in summary (React 비교, collapsible)

### Baseline 테스트
- [x] `pnpm test` 전체 통과 (347개, 가이드 콘텐츠 i18n 패리티 테스트 포함).
- [x] `pnpm dev` → `/guide/surface` 에서 React 코드가 접혀있고 클릭 시 펼쳐짐 확인.
- [x] en/ko 양쪽 가이드에서 동일하게 동작 확인.

---

## Phase 2-2: 라이선스 및 기본 메타 ✅

**Entry**: DC-01 확정.
**Exit**: LICENSE 파일 존재, `package.json` license 필드 일치.

- [x] `LICENSE` 파일 생성 (MIT).
- [x] `package.json` — `"license": "MIT"` 로 변경.

### Baseline 테스트
- [x] `LICENSE` 파일이 루트에 존재.
- [x] `package.json`의 `license` 필드와 `LICENSE` 파일 내용이 일치.

---

## Phase 2-3: README.md 작성 ✅

**Entry**: Phase 2-1 (퍼사드 완료 — import 예시가 `'state-surface'`여야 함).
**Exit**: README가 프로젝트 소개 + 퀵스타트 + 아키텍처 + API 개요를 포함.

- [x] 프로젝트 한줄 소개 + 핵심 컨셉 (MPA + NDJSON 스트리밍 + `<h-state>` 앵커).
- [x] 아키텍처 다이어그램 (Frame Flow: Action → POST → NDJSON → DOM).
- [x] 퀵스타트 (`npx create-state-surface my-app` → `pnpm dev`).
- [x] 4가지 핵심 개념 소개 (Surface, Template, Transition, Action).
- [x] 주요 기능 목록 (SSR, 스트리밍, abort previous, accumulate, i18n, View Transition API, 애니메이션 프리셋).
- [x] 프로젝트 구조 설명 (engine/ vs 사용자 코드).
- [x] 명령어 레퍼런스 (`pnpm dev`, `pnpm build`, `pnpm test` 등).
- [x] 라이선스 표기.
- [x] import 예시가 `'state-surface'` alias를 사용하는지 확인.

### Baseline 테스트
- [x] README 내 코드 예시의 import 경로가 전부 `'state-surface'`.
- [ ] README 내 명령어가 실제로 동작하는지 1회 수동 확인.

---

## Phase 2-4: 오래된 문서 정리

**Entry**: Phase 2-3 완료 (README가 BOOTSTRAP.md 역할 대체).
**Exit**: 오래된 문서가 삭제 또는 현행화.

- [ ] `BOOTSTRAP.md` — 삭제 (README 퀵스타트가 대체).
- [ ] `AGENTS.md` — engine/ 경로로 업데이트 또는 삭제.
- [ ] `IMPLEMENT.md` 상단 Phase 2 안내 확인 (이미 추가됨 — 검증만).

### Baseline 테스트
- [ ] 삭제된 문서에 대한 참조가 다른 문서(`CLAUDE.md`, `DESIGN.md`)에 남아있지 않음.

---

## Phase 2-5: package.json 정비

**Entry**: Phase 2-2 완료.
**Exit**: npm publish를 가로막는 필드가 제거되고 메타 필드 완비.

- [x] `"private": true` 제거.
- [x] `"keywords"` 추가 (`state-surface`, `mpa`, `ndjson`, `streaming`, `ssr` 등).
- [x] `"repository"`, `"homepage"`, `"bugs"` 필드 추가.
- [x] `"engines"` 필드 추가 (`"node": ">=20"`).
- [x] 버전 정책 확정 (0.x 시맨틱 버저닝).

> Note: `exports` 맵은 Phase 2-12(Public API 분리)에서 `./server`, `./client` 진입점과 함께 확정.

### Baseline 테스트
- [x] `npm pack --dry-run` 실행 시 에러 없음.

---

## Phase 2-7: createApp 팩토리 + 프로덕션 빌드

> 설계: `DESIGN_PHASE2.md` §3, §7.3–7.4
> 의존: 이후 모든 엔진 변경(훅, 플러그인, 보안, 인스턴스 기반)의 기반.

**Entry**: Phase 2-5 완료.
**Exit**: `createApp()` 팩토리로 서버 초기화. `pnpm build && pnpm start`로 프로덕션 서버 실행 가능.

### createApp 팩토리 (`DESIGN_PHASE2.md` §7.3–7.4)
- [x] `engine/server/index.ts`의 top-level await 코드를 `createApp(options)` 팩토리 함수로 래핑.
- [x] `StateSurfaceServerOptions` 인터페이스 정의 (`port`, `basePath`, `securityHeaders`, `bodyLimit`, `transitionTimeout`).
  - `hooks` 필드는 Phase 2-8에서 추가.
- [x] `createApp()`이 `{ app, port }` 반환.
- [x] 사용자 공간에 서버 엔트리 파일 생성 (`server.ts`):
  ```typescript
  import { createApp } from 'state-surface/server';
  const { app, port } = await createApp();
  app.listen(port, () => console.log(`Running at http://localhost:${port}`));
  ```
- [x] `pnpm dev` 스크립트를 `tsx watch server.ts`로 변경.
- [x] `PORT` 환경 변수 지원 (`process.env.PORT || 3000`).

### Vite SSR 빌드 (`DESIGN_PHASE2.md` §3.1–3.4)
- [x] `vite.config.ts` — `build.outDir: 'dist/client'`, `ssr.noExternal: ['lithent']` 추가.
- [x] `pnpm build` 스크립트: `vite build && vite build --ssr server.ts --outDir dist`.
- [x] `pnpm start` 스크립트: `NODE_ENV=production node dist/server.js`.
- [x] `createApp()` 내 prod/dev/test 분기:
  - production: `express.static('dist/client')` + 404 핸들러 + listen.
  - test: 404 핸들러만.
  - development: Vite 미들웨어 모드 (`startDev()`).

### Graceful Shutdown (`DESIGN_PHASE2.md` §3.5)
- [x] `SIGTERM`/`SIGINT` 핸들러 추가.
- [x] 강제 종료 타임아웃 10초 (진행 중 스트림 drain 대기).

### Baseline 테스트
- [x] `pnpm test` 전체 통과 (기존 테스트 회귀 없음).
- [ ] `PORT=4000 pnpm dev` → 4000번 포트에서 서버 기동.
- [ ] `BASE_PATH=/demo PORT=4000 pnpm dev` → 복합 설정 동작.
- [ ] `pnpm build` 성공 (클라이언트 + SSR 서버 빌드).
- [ ] `pnpm start` 후 주요 route 200 응답.
- [ ] 정적 에셋(JS/CSS) 정상 로드.
- [ ] 환경 변수 목록 문서화 (`PORT`, `BASE_PATH`, `NODE_ENV`).

---

## Phase 2-8: 서버 훅 + 클라이언트 플러그인

> 설계: `DESIGN_PHASE2.md` §1(서버 훅), §2(클라이언트 플러그인)
> 의존: Phase 2-7 (createApp 팩토리) 완료 필수.

**Entry**: Phase 2-7 완료 (createApp 팩토리 존재).
**Exit**: i18n 로직이 엔진에서 제거되고 훅으로 이동. Prism.js가 엔진에서 제거되고 플러그인으로 이동.

### 서버 훅 시스템 (`DESIGN_PHASE2.md` §1)
- [x] `TransitionHooks` 인터페이스 정의 (`onBeforeTransition`, `onAfterTransition`).
- [x] `StateSurfaceServerOptions`에 `hooks` 필드 추가.
- [x] `engine/server/index.ts` 트랜지션 엔드포인트에 훅 호출 지점 추가:
  - 트랜지션 핸들러 실행 전: `onBeforeTransition` 호출, 반환값으로 body 교체.
  - `res.end()` 직전: `onAfterTransition` 호출.
- [x] `TransitionHooks` 타입을 `engine/server.ts` barrel에서 export.

### i18n 분리 (`DESIGN_PHASE2.md` §1.3–1.4)
- [x] `engine/server/index.ts`에서 `shared/i18n.js` import 3개 제거 (`getLang`, `isValidLang`, `langCookie`).
- [x] `switch-lang` 하드코딩 (L53-55) 제거.
- [x] `body.lang = getLang(req)` 자동 주입 (L64) 제거.
- [x] `routes/_shared/hooks.ts` 생성 — i18n 로직을 사용자 훅으로 이동:
  ```typescript
  onBeforeTransition({ name, body, req, res }) {
    if (!body.lang) body.lang = getLang(req);
    if (name === 'switch-lang' && isValidLang(body.lang)) {
      res.setHeader('Set-Cookie', langCookie(body.lang));
    }
    return body;
  }
  ```
- [x] `server.ts`에서 훅 등록: `createApp({ hooks: transitionHooks })`.

### 클라이언트 플러그인 시스템 (`DESIGN_PHASE2.md` §2)
- [x] `StateSurfacePlugin` 인터페이스 정의 (`name`, `onInit`, `onMount`, `onUpdate`, `onUnmount`, `onTransitionStart`, `onTransitionEnd`).
- [x] `engine/client/main.ts`에 `createStateSurface(options)` 팩토리 함수 구현:
  - `fallbackTemplate`, `plugins`, `debug` 옵션 수용.
  - 플러그인 `onInit` 호출.
  - `debug` 모드일 때만 `window.__surface` 노출.
- [x] `engine/client/stateSurface.ts`에 플러그인 호출 지점 추가:
  - `mountTemplate()` 완료 후 → `plugin.onMount()`.
  - `updateSlot()` 완료 후 → `plugin.onUpdate()`.
  - `unmountTemplate()` 완료 후 → `plugin.onUnmount()`.
  - `runTransition()` 시작 → `plugin.onTransitionStart()`.
  - `runTransition()` 완료 → `plugin.onTransitionEnd()`.
- [x] `StateSurfacePlugin`, `createStateSurface` 타입을 `engine/client.ts` barrel에서 export.

### Prism.js 분리 (`DESIGN_PHASE2.md` §2.3–2.4)
- [x] `engine/client/main.ts`에서 Prism.js import 6개 제거.
- [x] `engine/client/main.ts`에서 `highlightCode()` + MutationObserver 제거.
- [x] `client/plugins/prism.ts` 생성 — Prism.js를 플러그인으로 구현 (onMount/onUpdate에서 highlight).
- [x] `client/main.ts` (사용자 엔트리)에서 `createStateSurface({ plugins: [prismPlugin()] })` 호출.
- [ ] `prismjs`를 `dependencies`에서 `devDependencies`로 이동 (또는 사용자가 직접 설치).

### Baseline 테스트
- [x] `pnpm test` 전체 통과.
- [ ] `pnpm dev` → 훅 경유한 i18n 동작 확인 (ko/en 전환, 쿠키 설정).
- [x] 훅 미등록 시에도 트랜지션 정상 동작 (훅 optional 검증).
- [ ] Prism.js 플러그인으로 가이드 코드 하이라이팅 정상 동작.
- [x] 플러그인 미등록 시에도 StateSurface 코어 정상 동작.
- [x] `engine/server/index.ts`에 `shared/i18n` import 없음 (grep 검증).
- [x] `engine/client/main.ts`에 `prismjs` import 없음 (grep 검증).

---

## Phase 2-9: 에러 처리 및 보안 강화

> 설계: `DESIGN_PHASE2.md` §4(에러), §5(보안)

**Entry**: Phase 2-7 완료 (createApp 옵션에 보안 설정 포함).
**Exit**: 알려진 에러 처리 갭 해소, 보안 헤더 적용, 스트림 타임아웃 동작.

### 에러 처리 (`DESIGN_PHASE2.md` §4)
- [ ] `engine/shared/ndjson.ts` — 3개 `JSON.parse` 호출에 try/catch 추가. 파싱 실패 시 해당 청크 스킵 + trace.
- [ ] `engine/server/routeHandler.ts` — `NODE_ENV=production`에서 SSR 에러 내부 메시지 미노출 (generic "Internal Server Error" 응답).
- [ ] transition 제너레이터 예외 시 에러 프레임 + 스트림 정상 종료 재확인.

### 트랜지션 스트림 타임아웃 (`DESIGN_PHASE2.md` §4.3)
- [ ] 서버측: `createApp` 옵션의 `transitionTimeout`(기본 30초) 적용.
  - AbortController로 타임아웃 시 에러 프레임 전송 + 스트림 종료.
- [ ] `TransitionHandler` 타입에 `options?: { signal?: AbortSignal }` 파라미터 추가.
- [ ] 클라이언트측: `stateSurface.ts`의 fetch에 timeout 설정 (`transitionTimeout` 옵션).

### 보안 (`DESIGN_PHASE2.md` §5)
- [ ] 기본 보안 헤더 미들웨어 추가 (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`).
  - `createApp({ securityHeaders: false })`로 비활성화 가능.
- [ ] SSR 응답에 `Content-Type: text/html; charset=utf-8` 명시 (`engine/server/routeHandler.ts`).
- [ ] `express.json({ limit })` — `createApp({ bodyLimit })` 옵션 반영 (기본 `100kb`).
- [ ] (선택) CORS 설정 옵션 제공.
- [ ] (선택) CSP 헤더 기본 정책 또는 문서화.

### Baseline 테스트
- [ ] 잘못된 JSON 청크가 포함된 NDJSON 스트림을 파싱해도 uncaught 예외 없음 (단위 테스트).
- [ ] `NODE_ENV=production` SSR 에러 응답에 스택 트레이스 미포함 (단위 테스트).
- [ ] 응답 헤더에 `X-Content-Type-Options: nosniff` 포함 (단위 테스트).
- [ ] SSR 응답 Content-Type이 `text/html; charset=utf-8` (단위 테스트).
- [ ] 30초 초과 트랜지션이 타임아웃 에러 프레임으로 종료됨 (단위 테스트).

---

## Phase 2-10: CI/CD

**Entry**: Phase 2-5 완료.
**Exit**: PR/push 시 자동 lint + test.

- [ ] `.github/workflows/ci.yml`:
  - `pnpm install`
  - `pnpm format:check`
  - `pnpm test`
- [ ] (선택) `.github/workflows/publish.yml` — `state-surface`, `create-state-surface` npm 배포 자동화.
- [ ] GitHub Actions badge를 README에 추가.

### Baseline 테스트
- [ ] CI workflow가 현재 main 브랜치에서 green.

---

## Phase 2-11: 커뮤니티 인프라

**Entry**: Phase 2-3 완료 (README 존재).
**Exit**: 기여에 필요한 문서 + 템플릿 완비.

- [ ] `CONTRIBUTING.md` — 개발환경 셋업, PR 규칙, 커밋 컨벤션, 테스트 가이드.
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] `.github/pull_request_template.md`
- [ ] `CODE_OF_CONDUCT.md` (Contributor Covenant 등).
- [ ] `CHANGELOG.md` 초기 작성 (Keep a Changelog 형식).

### Baseline 테스트
- [ ] GitHub에서 새 이슈 생성 시 템플릿 선택지가 표시됨.

---

## Phase 2-12: Public API 분리 + 타입 품질

> 설계: `DESIGN_PHASE2.md` §6
> 의존: Phase 2-8 (훅·플러그인) 완료 필수 — 새 export 대상(`TransitionHooks`, `StateSurfacePlugin`, `createStateSurface`, `createApp`)이 확정되어야 함.

**Entry**: Phase 2-8 완료 (서버 훅 + 클라이언트 플러그인 존재).
**Exit**: `'state-surface'`, `'state-surface/server'`, `'state-surface/client'` 3개 진입점 동작. IDE 자동완성 정상.

### Public API 3분할 (`DESIGN_PHASE2.md` §6.2–6.3)
- [x] `engine/index.ts` — 공통 타입/유틸만 export:
  - `prefixPath`, `getBasePath`, `defineTemplate`
  - `type RouteModule`, `type BootConfig`, `type StateFrame`, `type TemplateModule`
- [x] `engine/server.ts` 생성 — 서버 전용 API export:
  - `createApp`, `defineTransition`
  - `type TransitionHandler`, `type TransitionHooks`, `type StateSurfaceServerOptions`
- [x] `engine/client.ts` 생성 — 클라이언트 전용 API export:
  - `createStateSurface`
  - `type StateSurfacePlugin`
- [x] `package.json` `exports` 맵 확장:
  ```json
  {
    ".": "./engine/index.ts",
    "./server": "./engine/server.ts",
    "./client": "./engine/client.ts"
  }
  ```
- [x] `tsconfig.json` `paths` 추가 (`state-surface/server`, `state-surface/client`).
- [x] `vite.config.ts` `resolve.alias` 추가.
- [x] 사용자 코드 import 경로 마이그레이션:
  - `defineTransition` → `import from 'state-surface/server'`
  - `createStateSurface` → `import from 'state-surface/client'`

### TypeScript 타입 품질
- [x] `tsconfig.json`에서 `declaration: true` 활성화 여부 검토.
  - 검토 결과: 현재 monorepo/패키지 분리(Phase 2-6) 전 단계이므로 `declaration`은 이번 phase에서 미활성 유지.
- [x] public API 타입 정리 (`StateFrame`, `RouteModule`, `TransitionHandler`, `StateSurfaceServerOptions`, `StateSurfacePlugin`).
- [ ] 스캐폴딩 프로젝트에서 `'state-surface'` import 후 자동완성 확인.

### Baseline 테스트
- [ ] `import { defineTemplate } from 'state-surface'` — TS 에러 없음.
- [ ] `import { createApp } from 'state-surface/server'` — TS 에러 없음.
- [ ] `import { createStateSurface } from 'state-surface/client'` — TS 에러 없음.
- [x] 서버 전용 API가 `'state-surface'`(공통)에서 import 불가 확인.
- [x] `pnpm test` 전체 통과.

> Note: 저장소의 기존 광범위 TypeScript 오류로 인해(`npx tsc --noEmit`) 3개 import의 "TS 에러 없음" 항목은 분리 검증을 완료하지 못해 미체크 상태로 유지.

---

## Phase 2-6: state-surface 코어 패키지 분리 + create-state-surface CLI

> 설계: `DESIGN_PHASE2.md` §6.4

Phase 1의 Phase 16 승계 + 확장. 핵심은 프레임워크 코드를 `state-surface` npm 패키지로 분리하고,
CLI는 신규 프로젝트 생성에만 사용하도록 역할을 고정하는 것이다.

**Entry**: Phase 2-12 완료 (Public API 분리 + 타입 확정).
**Exit**:
- `state-surface` 패키지를 독립 배포할 수 있음.
- 기존 프로젝트는 `pnpm up state-surface`로 업데이트 가능.
- `npx create-state-surface my-app`은 신규 생성만 담당.

### 코어 패키지 분리
- [ ] 프레임워크 런타임 코드를 npm 배포 단위 `state-surface`로 분리 (public API + runtime + types).
- [ ] 샘플 앱/사이트 코드(`routes`, `layouts`, `shared/content` 등)를 `state-surface` publish 대상에서 제외.
- [ ] `state-surface` 패키지 메타 정비:
  - `name`, `version`, `exports`, `types`, `files`, `publishConfig`.
  - `exports`는 `'state-surface'`, `'state-surface/server'`, `'state-surface/client'`를 그대로 노출.
- [ ] `npm pack` 기준으로 불필요 파일 누락/필수 파일 포함 검증.

### 업데이트 경로/마이그레이션 체계
- [ ] `MIGRATION.md` 작성: 버전별 breaking change, 수동 수정 절차, 검증 단계.
- [ ] (선택) `state-surface migrate` codemod 엔트리 정의 (반복되는 import/설정 변경 자동화).
- [ ] 릴리스 노트 템플릿에 "업데이트 절차 (`pnpm up state-surface`)" 섹션 고정.

### CLI 설계 (생성 전용)
- [ ] `create-state-surface/` 디렉토리 구조 확정.
- [ ] `../lithent/createLithent` 코드 참고해 CLI 진입점 구현 방식 결정.
- [ ] 옵션 정책 확정 (기본: 전체 포함, 선택 옵션 최소화).
- [ ] 생성 후 안내 문구 확정 (`cd`, `pnpm install`, `pnpm dev`).
- [ ] CLI 도움말/README에 "업데이트는 재생성이 아니라 `pnpm up state-surface`" 명시.

### CLI 템플릿 소스
- [ ] `create-state-surface/template/`에 현재 프로젝트 구조 반영.
- [ ] 불필요한 파일 제외 (`.git`, `node_modules`, `dist`, `IMPLEMENT*.md`, `DESIGN*.md`, `PROTOCOL.md` 등).
- [ ] `package.json.template` — 프로젝트명 치환 + `state-surface` 의존성 버전 범위 삽입.
- [ ] 템플릿에 `server.ts` (사용자 서버 엔트리), `client/main.ts` (사용자 클라이언트 엔트리) 포함.
- [ ] 템플릿에 `routes/_shared/hooks.ts` (i18n 훅) 포함.
- [ ] 템플릿에 `client/plugins/prism.ts` (Prism 플러그인) 포함.

### CLI 구현/배포 설정
- [ ] `bin/create-state-surface.js` — 프로젝트명 입력 → 디렉토리 생성 → 파일 복사 → 치환.
- [ ] 프로젝트명/설명 치환 처리.
- [ ] Git 초기화 (`git init`) 자동 실행.
- [ ] 완료 후 안내 메시지 출력.
- [ ] `create-state-surface/package.json` — `"name"`, `"bin"`, `"files"`, `"publishConfig"`.
- [ ] `.npmignore` 또는 `"files"` 화이트리스트.
- [ ] `npm pack` → 로컬 설치 검증.

### Baseline 테스트
- [ ] 빈 디렉토리에서 `npx create-state-surface my-app` 1회 실행으로 프로젝트 생성.
- [ ] 생성 프로젝트의 `package.json`이 `state-surface` 의존성을 포함.
- [ ] 생성 프로젝트에서 `pnpm install && pnpm test` 통과.
- [ ] 생성 프로젝트에서 `pnpm dev` 후 주요 route 200 + transition 응답 확인.
- [ ] 생성 결과물의 import 경로가 `'state-surface'`, `'state-surface/server'`, `'state-surface/client'` 사용.
- [ ] 생성 프로젝트에서 `pnpm build && pnpm start` → 프로덕션 모드 동작.
- [ ] 기존 프로젝트 fixture에서 `pnpm up state-surface` 후 빌드/테스트 통과 (재스캐폴딩 없이 업데이트 검증).

---

## Phase 2-13: 전역 싱글턴 → 인스턴스 기반 + Test Hardening

> 설계: `DESIGN_PHASE2.md` §8

**Entry**: Phase 2-8 완료 (createApp 팩토리 존재).
**Exit**: 서버측 레지스트리가 인스턴스 기반. 모든 스모크 항목 pass.

### 싱글턴 → 인스턴스 (`DESIGN_PHASE2.md` §8)
- [ ] `createApp()` 내부에서 격리된 `templateRegistry`, `transitionRegistry` 인스턴스 생성.
- [ ] `bootstrapServer()`에 레지스트리 인스턴스 주입 파라미터 추가.
- [ ] `transitionRegistry`에 `clearRegistry()` 추가 (templateRegistry와 일관성).
- [ ] 클라이언트측 templateRegistry는 모듈 레벨 유지 (브라우저는 단일 인스턴스).

### Phase 1 잔여 스모크
- [ ] Action: search/features/chat 페이지 `data-action` end-to-end.
- [ ] Action: pending visual feedback.
- [ ] i18n: 모든 페이지 ko/en 전환.
- [ ] i18n: MPA 네비게이션 시 쿠키 유지.
- [ ] basePath: `BASE_PATH=/demo pnpm dev` 전체 동작.
- [ ] Guide: `/guide/quickstart` 4단계 표시.
- [ ] Guide: concept 가이드 analogy/debug 섹션.
- [ ] Guide: ko/en 구조 동일.
- [ ] Guide: 모바일 레이아웃.
- [ ] Chat: 메시지 즉시 표시, 스트리밍 누적, abort, 언어 전환.
- [ ] Chat: 템플릿에 `mount`/`state` import 없음.

### Phase 2 추가 스모크
- [ ] 프로덕션 빌드 후 전체 route 접근 가능.
- [ ] `npx create-state-surface` 생성물이 기준 사이트와 시각적 일치.

### Baseline 테스트 자동화
- [ ] 테스트 간 레지스트리 격리 확인 (병렬 테스트에서 상태 누수 없음).
- [ ] basePath 통합 테스트 추가 (Express 라우트 접근, transition URL, 쿠키 Path).
- [ ] NDJSON malformed JSON 청크 스킵 테스트.
- [ ] SSR production 에러 응답 테스트.

---

## Phase 2-14: Integration Test

Phase 전체를 관통하는 통합 검증.

**Entry**: Phase 2-13 완료.
**Exit**: 신규 프로젝트 스캐폴딩 → 전체 파이프라인 동작 확인.

- [ ] 빈 디렉토리에서 `create-state-surface` → `pnpm install` → `pnpm test` → 전체 통과.
- [ ] `pnpm dev` → SSR 렌더링 → data-action → NDJSON 스트리밍 → DOM 업데이트.
- [ ] `pnpm build && pnpm start` → 프로덕션 모드 동작.
- [ ] `BASE_PATH=/demo pnpm dev` → 서브패스 동작.
- [ ] ko/en 언어 전환 → 쿠키 유지 → MPA 네비게이션.
- [ ] 훅 기반 i18n 동작 검증 (엔진에 i18n 하드코딩 없음 확인).
- [ ] 플러그인 기반 Prism 동작 검증 (엔진에 Prism 하드코딩 없음 확인).

### (선택) E2E 자동화
- [ ] DC-04 확정 후 E2E 도구 도입.
- [ ] 핵심 시나리오: SSR, data-action, 스트리밍, 언어 전환, chat abort.
- [ ] CI에 E2E 통합.

---

## Phase 2-15: 로깅 개선 (선택)

**Entry**: Phase 2-9 완료.
**Exit**: 프로덕션 환경에서 불필요한 로그 억제.

- [ ] 서버 로그에 요청 메서드/URL/상태코드 기본 출력.
- [ ] `NODE_ENV=production`에서 verbose 로그 억제.
- [ ] (선택) 간단한 로그 레벨 시스템 (`debug`, `info`, `warn`, `error`).

### Baseline 테스트
- [ ] `NODE_ENV=production`에서 debug 로그가 stdout에 출력되지 않음.

---

## Definition of Done (v0.1.0 프로덕션 릴리스)

### 엔진 아키텍처
- [ ] `createApp()` 팩토리로 서버 초기화 (top-level side effect 없음).
- [ ] `createStateSurface()` 팩토리로 클라이언트 초기화 (앱 코드 분리).
- [ ] 서버 훅 시스템 동작 (`TransitionHooks`).
- [ ] 클라이언트 플러그인 시스템 동작 (`StateSurfacePlugin`).
- [ ] i18n/Prism.js 코드가 엔진에서 완전 제거, 사용자 공간으로 이동.
- [ ] Public API 3분할: `state-surface`, `state-surface/server`, `state-surface/client`.

### 프로덕션 빌드
- [ ] `pnpm build` — Vite SSR 빌드 (클라이언트 + 서버).
- [ ] `pnpm start` — 프로덕션 서버 실행.
- [ ] Graceful shutdown 동작.
- [ ] 보안 헤더 기본 적용.
- [ ] 트랜지션 스트림 타임아웃 동작.

### 배포
- [ ] npm에 `state-surface` 패키지 배포.
- [ ] `npx create-state-surface my-app`으로 프로젝트 생성 가능.
- [ ] 생성된 프로젝트에서 `pnpm dev` + `pnpm test` + `pnpm build && pnpm start` 전부 동작.
- [ ] npm에 `create-state-surface` 패키지 배포.
- [ ] 기존 프로젝트가 `pnpm up state-surface`로 업데이트 가능 (재스캐폴딩 불필요).

### 품질
- [ ] 사용자 코드 import가 `'state-surface'`/`'state-surface/server'`/`'state-surface/client'` 사용.
- [ ] README에 퀵스타트, 아키텍처, 핵심 개념 문서화.
- [ ] 오픈소스 라이선스 적용 (LICENSE 파일 존재).
- [ ] GitHub Actions CI green.
- [ ] Phase 2-13 스모크 항목 전부 pass.
- [ ] Phase 2-14 통합 테스트 전부 pass.
- [ ] Open Decisions 전부 resolved.

---

## 우선순위 요약

| 순서 | Phase | 중요도 | DESIGN 섹션 | 비고 |
|------|-------|--------|------------|------|
| ~~1~~ | ~~**2-1 퍼사드 + Alias**~~ | ~~Critical~~ | — | ✅ 완료 |
| ~~2~~ | ~~**2-1.5 가이드 UX**~~ | ~~High~~ | — | ✅ 완료 |
| ~~3~~ | ~~**2-2 라이선스**~~ | ~~Critical~~ | — | ✅ 완료 |
| ~~4~~ | ~~**2-3 README**~~ | ~~Critical~~ | — | ✅ 완료 |
| 5 | **2-5 package.json** | Critical | — | 배포 기본 설정 |
| 6 | **2-7 createApp + 프로덕션 빌드** | **Critical** | §3, §7 | 이후 모든 변경의 기반 |
| ~~7~~ | ~~**2-8 서버 훅 + 클라이언트 플러그인**~~ | ~~**Critical**~~ | §1, §2 | ✅ 완료 (i18n·Prism 분리) |
| 8 | **2-9 에러/보안** | **High** | §4, §5 | 안정성·타임아웃 |
| ~~9~~ | ~~**2-12 Public API 분리 + 타입**~~ | ~~**High**~~ | §6 | ✅ 완료 (3분할 진입점) |
| 10 | **2-6 코어 패키지 + CLI** | **Critical** | §6.4 | 생성/업데이트 경로 분리 |
| 11 | 2-10 CI | High | — | 기여자 신뢰도 |
| 12 | 2-4 문서 정리 | Medium | — | 혼란 방지 |
| 13 | 2-11 커뮤니티 | Medium | — | 기여 촉진 |
| 14 | **2-13 싱글턴→인스턴스 + Test Hardening** | Medium | §8 | 테스트 품질 |
| 15 | **2-14 Integration Test** | Medium | — | 최종 검증 |
| 16 | 2-15 로깅 | Low | — | 선택 |

### 의존성 그래프

```
2-5 package.json
  └── 2-7 createApp + 프로덕션 빌드     ← 기반
        ├── 2-8 서버 훅 + 클라이언트 플러그인
        │     └── 2-12 Public API 분리
        │           └── 2-6 코어 패키지 + CLI (API 확정 후 배포/템플릿 정렬)
        ├── 2-9 에러/보안
        └── 2-13 싱글턴→인스턴스

2-10 CI, 2-11 커뮤니티, 2-4 문서 정리 — 독립 (병행 가능)
2-14 Integration Test — 모든 Phase 완료 후
2-15 로깅 — 선택, 독립
```

---

## 마이그레이션 참조

> 상세: `DESIGN_PHASE2.md` §10

| Phase | Breaking Change | 마이그레이션 |
|-------|----------------|-------------|
| 2-7 | 서버 엔트리 → `createApp()` 팩토리 | `server.ts` 파일 생성, `pnpm dev` 스크립트 변경 |
| 2-8 | i18n 자동 주입 제거 | `routes/_shared/hooks.ts`에 훅으로 이동 |
| 2-8 | 클라이언트 엔트리 → `createStateSurface()` | `client/main.ts` 수정, Prism 플러그인으로 이동 |
| 2-12 | `defineTransition` import 경로 변경 | `'state-surface'` → `'state-surface/server'` |
| 2-6 | 업데이트 경로 전환 (`재스캐폴딩` → `패키지 업그레이드`) | `pnpm up state-surface`, 브레이킹은 `MIGRATION.md`/`state-surface migrate` 적용 |

각 단계는 `pnpm test` 통과를 게이트로 한다.

---

## Handoff Status

- **Done**: Phase 2-1, 2-1.5, 2-2, 2-3, 2-5, 2-7, 2-8, 2-12 완료.
- **Next**: Phase 2-9 (에러 처리 및 보안 강화).
- **Resolved**: DC-01 (MIT), DC-02 (Vite SSR), DC-03 (환경 변수만), DC-05 (업데이트 경로).
- **Blockers**: 없음.
- **Latest commit**: not committed yet.
