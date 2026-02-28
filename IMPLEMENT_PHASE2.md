# StateSurface Phase 2 — 오픈소스 릴리스 준비

Phase 1(`IMPLEMENT.md`, 동결)의 미완료 항목 + 오픈소스 배포에 필요한 신규 항목을 통합 정리한다.
배포 모델은 **CLI 스캐폴딩** (`npx create-state-surface my-app`).

읽기 순서: `DESIGN.md` → `PROTOCOL.md` → `IMPLEMENT.md`(Phase 1 이력) → **이 파일**.

---

## Open Decisions

미해결 설계 결정. 해당 Phase 착수 전에 확정하고 근거를 기록한다.

- [x] **DC-01** 라이선스 선택: **MIT** 확정
- [ ] **DC-02** 프로덕션 서버 실행 방식: `tsx` 직접 실행(A) vs `tsup`/`esbuild` 번들(B) — TBD (Phase 2-7 착수 전 확정)
- [ ] **DC-03** 설정 파일 도입 여부: 환경 변수만(A) vs `state-surface.config.ts`(B) — TBD (Phase 2-8 착수 전 확정)
- [ ] **DC-04** E2E 테스트 도구: Playwright(A) vs Cypress(B) vs 생략(C) — TBD (Phase 2-14 착수 전 확정)

---

## Phase 2-1: Public API 퍼사드 + Import Alias

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

## Phase 2-1.5: 가이드 코드 블록 UX 개선

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
- [ ] `pnpm dev` → `/guide/surface` 에서 React 코드가 접혀있고 클릭 시 펼쳐짐 확인.
- [ ] en/ko 양쪽 가이드에서 동일하게 동작 확인.

---

## Phase 2-2: 라이선스 및 기본 메타

**Entry**: DC-01 확정.
**Exit**: LICENSE 파일 존재, `package.json` license 필드 일치.

- [x] `LICENSE` 파일 생성 (MIT).
- [x] `package.json` — `"license": "MIT"` 로 변경.

### Baseline 테스트
- [x] `LICENSE` 파일이 루트에 존재.
- [x] `package.json`의 `license` 필드와 `LICENSE` 파일 내용이 일치.

---

## Phase 2-3: README.md 작성

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

- [ ] `"private": true` 제거.
- [ ] `"keywords"` 추가 (`state-surface`, `mpa`, `ndjson`, `streaming`, `ssr` 등).
- [ ] `"repository"`, `"homepage"`, `"bugs"` 필드 추가.
- [ ] `"engines"` 필드 추가 (`"node": ">=20"`).
- [ ] 버전 정책 확정 (0.x 시맨틱 버저닝).

> Note: `main`/`exports`/`files`는 Phase 2-6(CLI 패키지)에서 다룸.
> state-surface 본체는 직접 npm install하는 패키지가 아닌 스캐폴딩 템플릿.

### Baseline 테스트
- [ ] `npm pack --dry-run` 실행 시 에러 없음.

---

## Phase 2-6: create-state-surface CLI

Phase 1의 Phase 16 승계. 사용자가 프로젝트를 시작하는 유일한 공식 경로.

**Entry**: Phase 2-1 + 2-5 완료 (alias 적용된 코드가 템플릿 소스).
**Exit**: `npx create-state-surface my-app` → `pnpm dev` → 데모 사이트 동작.

### 설계
- [ ] `create-state-surface/` 디렉토리 구조 확정.
- [ ] `../lithent/createLithent` 코드 참고해 CLI 진입점 구현 방식 결정.
- [ ] 옵션 정책 확정 (기본: full demo 포함, 선택 옵션 최소화).
- [ ] 생성 후 안내 문구 확정 (`cd`, `pnpm install`, `pnpm dev`).

### 템플릿 소스
- [ ] `create-state-surface/template/` 에 현재 프로젝트 구조 반영.
- [ ] 불필요한 파일 제외 (`.git`, `node_modules`, `dist`, `IMPLEMENT*.md`, `DESIGN.md`, `PROTOCOL.md` 등).
- [ ] `package.json.template` — 프로젝트명 치환 플레이스홀더 삽입.

### CLI 구현
- [ ] `bin/create-state-surface.js` — 프로젝트명 입력 → 디렉토리 생성 → 파일 복사 → 치환.
- [ ] 프로젝트명/설명 치환 처리.
- [ ] Git 초기화 (`git init`) 자동 실행.
- [ ] 완료 후 안내 메시지 출력.

### CLI 패키지 배포 설정
- [ ] `create-state-surface/package.json` — `"name"`, `"bin"`, `"files"`, `"publishConfig"`.
- [ ] `.npmignore` 또는 `"files"` 화이트리스트.
- [ ] `npm pack` → 로컬 설치 검증.

### Baseline 테스트
- [ ] 빈 디렉토리에서 `npx create-state-surface my-app` 1회 실행으로 프로젝트 생성.
- [ ] 생성 프로젝트에서 `pnpm install && pnpm test` 통과.
- [ ] 생성 프로젝트에서 `pnpm dev` 후 주요 route 200 + transition 응답 확인.
- [ ] 생성 결과물의 import 경로가 전부 `'state-surface'`.

---

## Phase 2-7: 프로덕션 빌드 및 배포 경로

**Entry**: DC-02 확정.
**Exit**: `pnpm build && pnpm start`로 프로덕션 서버 실행 가능.

- [ ] DC-02에서 확정한 방식으로 프로덕션 서버 엔트리 구성.
- [ ] `pnpm start` (또는 `pnpm preview`) 스크립트 추가.
- [ ] Vite 클라이언트 빌드 출력물을 프로덕션 서버에서 정적 서빙.
- [ ] README에 프로덕션 배포 가이드 추가.

### Baseline 테스트
- [ ] `pnpm build` 성공.
- [ ] `pnpm start` 후 주요 route 200 응답.
- [ ] 정적 에셋(JS/CSS) 정상 로드.

---

## Phase 2-8: 설정 및 환경 변수

**Entry**: DC-03 확정.
**Exit**: PORT 환경 변수 동작, 설정 방법 문서화.

- [ ] `PORT` 환경 변수 지원 (`process.env.PORT || 3000`).
- [ ] 환경 변수 목록 문서화 (`PORT`, `BASE_PATH`, `NODE_ENV`).
- [ ] DC-03이 B(설정 파일)인 경우:
  - [ ] `state-surface.config.ts` 로더 구현.
  - [ ] 후보 옵션: `port`, `basePath`, `routesDir`, `layoutsDir`.

### Baseline 테스트
- [ ] `PORT=4000 pnpm dev` → 4000번 포트에서 서버 기동.
- [ ] `BASE_PATH=/demo PORT=4000 pnpm dev` → 복합 설정 동작.

---

## Phase 2-9: 에러 처리 및 보안 강화

**Entry**: Phase 2-1 완료.
**Exit**: 알려진 에러 처리 갭 해소, 최소 보안 헤더 적용.

### 에러 처리
- [ ] `engine/shared/ndjson.ts` — `JSON.parse` try/catch 추가. 파싱 실패 시 해당 청크 스킵 + trace.
- [ ] `engine/server/routeHandler.ts` — `NODE_ENV=production`에서 SSR 에러 내부 메시지 미노출 (generic 응답).
- [ ] transition 제너레이터 예외 시 에러 프레임 + 스트림 정상 종료 재확인.

### 보안 헤더
- [ ] 기본 보안 헤더 추가 (최소 `X-Content-Type-Options: nosniff`).
- [ ] (선택) CORS 설정 옵션 제공.
- [ ] (선택) CSP 헤더 기본 정책 또는 문서화.

### Baseline 테스트
- [ ] 잘못된 JSON 청크가 포함된 NDJSON 스트림을 파싱해도 uncaught 예외 없음 (단위 테스트).
- [ ] `NODE_ENV=production` SSR 에러 응답에 스택 트레이스 미포함 (단위 테스트).
- [ ] 응답 헤더에 `X-Content-Type-Options: nosniff` 포함 (단위 테스트).

---

## Phase 2-10: CI/CD

**Entry**: Phase 2-5 완료.
**Exit**: PR/push 시 자동 lint + test.

- [ ] `.github/workflows/ci.yml`:
  - `pnpm install`
  - `pnpm format:check`
  - `pnpm test`
- [ ] (선택) `.github/workflows/publish.yml` — create-state-surface npm 배포 자동화.
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

## Phase 2-12: TypeScript 타입 품질

**Entry**: Phase 2-1 완료 (퍼사드 barrel 존재).
**Exit**: 스캐폴딩 프로젝트에서 IDE 자동완성 정상 동작.

- [ ] `tsconfig.json`에서 `declaration: true` 활성화 여부 검토.
- [ ] public API 타입 정리 (`StateFrame`, `RouteModule`, `TransitionHandler`, `StateSurfaceOptions`).
- [ ] 스캐폴딩 프로젝트에서 `'state-surface'` import 후 자동완성 확인.

### Baseline 테스트
- [ ] `import { defineTemplate } from 'state-surface'` 에서 TS 에러 없음.
- [ ] `defineTemplate`, `defineTransition`의 파라미터 타입이 IDE에서 추론됨.

---

## Phase 2-13: Test Hardening

Phase 1 잔여 스모크 + Phase 2 추가 항목을 자동화 또는 수동 확인.

**Entry**: Phase 2-1 ~ 2-9 완료.
**Exit**: 모든 스모크 항목 pass 또는 자동화 완료.

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
- [ ] `npx create-state-surface` 생성물이 데모와 시각적 일치.

### Baseline 테스트 자동화
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

## Definition of Done (v0.1.0 오픈소스 릴리스)

- [ ] `npx create-state-surface my-app`으로 프로젝트 생성 가능.
- [ ] 생성된 프로젝트에서 `pnpm dev` + `pnpm test` + `pnpm build` 전부 동작.
- [ ] 사용자 코드 import가 전부 `'state-surface'` alias 사용.
- [ ] README에 퀵스타트, 아키텍처, 핵심 개념 문서화.
- [ ] 오픈소스 라이선스 적용 (LICENSE 파일 존재).
- [ ] GitHub Actions CI green.
- [ ] npm에 `create-state-surface` 패키지 배포.
- [ ] Phase 2-13 스모크 항목 전부 pass.
- [ ] Phase 2-14 통합 테스트 전부 pass.
- [ ] Open Decisions 전부 resolved.

---

## 우선순위 요약

| 순서 | Phase | 중요도 | 비고 |
|------|-------|--------|------|
| ~~1~~ | ~~**2-1 퍼사드 + Alias**~~ | ~~Critical~~ | ✅ 완료 (`78af4c3`) |
| 2 | **2-1.5 가이드 코드 블록 UX** | High | 가이드 가독성, React 코드 접기 |
| 3 | 2-2 라이선스 | Critical | 5분이면 끝남 |
| 4 | 2-3 README | Critical | 오픈소스 첫인상 |
| 5 | 2-5 package.json | Critical | 배포 기본 설정 |
| 6 | 2-6 CLI | Critical | 사용자 진입점 |
| 7 | 2-7 프로덕션 빌드 | High | 실사용 필수 |
| 8 | 2-9 에러/보안 | High | 품질 신뢰도 |
| 9 | 2-10 CI | High | 기여자 신뢰도 |
| 10 | 2-4 문서 정리 | Medium | 혼란 방지 |
| 11 | 2-8 설정 | Medium | 사용 편의 |
| 12 | 2-11 커뮤니티 | Medium | 기여 촉진 |
| 13 | 2-12 타입 | Medium | DX |
| 14 | **2-13 Test Hardening** | Medium | 품질 게이트 |
| 15 | **2-14 Integration Test** | Medium | 최종 검증 |
| 15 | 2-15 로깅 | Low | 선택 |

---

## Handoff Status

- **Done**: Phase 2-1 (퍼사드 + alias) 완료. 42파일 변경, 347 테스트 통과. `pnpm dev` 스모크 1건 미확인.
- **Next**: Phase 2-2 (라이선스 — DC-01 확정 필요) → Phase 2-3 (README).
- **Blockers**: 없음.
- **Commit**: `78af4c3` refactor: add public API facade and 'state-surface' import alias.
