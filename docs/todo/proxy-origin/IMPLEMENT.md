# TLS 리버스 프록시 뒤 Origin 설정 — 구현 계획

작성일: 2026-11-12
상태: Todo — 미착수

설계: [DESIGN.md](./DESIGN.md) · 요구사항: [REQUIREMENTS.md](./REQUIREMENTS.md) ·
수동 확인: [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md)

## Handoff

- 완료: 문서 작성만(이 묶음). 코드 변경 없음.
- 다음: Phase 1(node·express 템플릿). DC-PO-2~5는 Phase 3 이후 시작 전에 사용자 결정이 필요하다.
- 블로커: 없음(Phase 1·2). Phase 3·4는 DC-PO-2·3, 릴리스 순서는 DC-PO-4 결정 대기.
- 운영 메모: 데모 서버(`/var/www/state-surface`)는 2026-11-12에 `server.ts`를 수동 수정했다. Phase 2 배포 후 재배포하면
  템플릿 기본값으로 대체된다(`ecosystem.config.cjs`의 `ORIGIN` env는 유지).
- 최신 커밋: `e539d13`

## Phase 1 — node·express 템플릿과 안내: todo

Refs: RQ-PO-1, RQ-PO-2, DC-PO-1, M-PO-1, M-PO-5

진입 조건: 없음.

- [ ] `create-state-surface/templates/adapters/node/server.ts`에 `origin: process.env.ORIGIN || undefined`와 주석(DESIGN 2.1).
- [ ] `create-state-surface/templates/adapters/express/server.ts`에 같은 옵션.
- [ ] `create-state-surface/templates/base/env.example`에 주석 처리된 `ORIGIN` 안내(DESIGN 2.2).
- [ ] `templates/demo/README.md`, `templates/minimal/README.md`, `create-state-surface/README.md`에 "프록시 뒤 배포" 단락.
- [ ] `docs/server-adapters.md`의 TLS 종료 문단(현재 71-73행)에 `ORIGIN` 템플릿 관례를 한 줄 추가.
- [ ] 레포의 conformance·e2e 앱이 같은 서버 엔트리를 쓰면 함께 맞춘다(`conformance/app`, `e2e/scaffold` 확인).

기준 테스트:

- `pnpm test`(전체), `pnpm format:check`
- `pnpm test:scaffold` — 생성 앱이 `ORIGIN` 없이 build·start·test 통과(기존 동작 유지)

종료 조건: 기준 테스트 통과, 생성 앱의 `server.ts`·`.env.example`에 변경이 보임.

## Phase 2 — create-state-surface 0.2.1 배포: todo

Refs: RQ-PO-3, DC-PO-4, M-PO-1, M-PO-2

진입 조건: Phase 1 완료·main push. DC-PO-4가 (b)로 결정되면 이 단계는 Phase 7로 합친다.

- [ ] Phase 1 커밋 SHA로 `create-state-surface/bin/create-state-surface.js`의 `TEMPLATE_REF` 갱신(ref push 후).
- [ ] `create-state-surface/package.json` 버전 0.2.1, `USER_PUBLISH.md` 절차의 버전 점검.
- [ ] publish(GitHub Actions trusted publishing).

기준 테스트: `pnpm test:scaffold`, `npx create-state-surface@0.2.1 tmp-app --template demo --adapter node`로 생성물 확인.

종료 조건: M-PO-1 통과. 가능하면 데모 서버 재배포로 M-PO-2 확인.

## Phase 3 — Bun·Deno `origin` 옵션: todo

Refs: RQ-PO-4, DC-PO-2, M-PO-6

진입 조건: DC-PO-2 결정.

- [ ] `engine/adapters/bun.ts`, `engine/adapters/deno.ts`의 `serve()`에 `origin?: string`, 요청 URL origin 교체(DESIGN 2.3).
- [ ] 본문 스트림·`signal`·헤더가 교체된 Request에서 유지되는지 확인.
- [ ] `templates/adapters/bun/server.ts`(`process.env.ORIGIN || undefined`), `templates/adapters/deno/server.ts`
      (`Deno.env.get('ORIGIN') || undefined`).
- [ ] `docs/server-adapters.md` 진입점 표·TLS 문단 갱신.

기준 테스트: `pnpm test`, `pnpm test:adapters bun deno`(빌드 후).

종료 조건: Bun·Deno에서 `origin` 설정 시 https Origin POST 200, 미설정 시 기존과 동일.

## Phase 4 — 403 진단 힌트: todo

Refs: RQ-PO-5, DC-PO-3, M-PO-3, M-PO-4

진입 조건: DC-PO-3 결정.

- [ ] `engine/server/core/handler.ts` Origin 검사 실패 경로에서 같은 host·다른 scheme이면 프로세스당 1회 `logger.warn`(DESIGN 2.4).
- [ ] 응답 상태·본문은 변경하지 않음.

기준 테스트: `pnpm test engine/server`, `pnpm test engine/hardening`(악성 입력 회귀).

종료 조건: 경고 1회, 다른 host 403에는 경고 없음, 기존 hardening 통과.

## Phase 5 — Test Hardening: todo

Refs: RQ-PO-1, RQ-PO-4, RQ-PO-5, DC-PO-1, DC-PO-2, DC-PO-3

진입 조건: Phase 1(그리고 진행한 경우 3·4) 완료.

- [ ] `engine/adapters/http.ts`: `origin` 지정 시 `ctx.url.origin`이 그 값, 경로·쿼리 유지, `//host` 경로가 authority를 바꾸지 않음.
- [ ] 빈 `ORIGIN`(`''`) 처리: 템플릿 표현식이 `undefined`로 바꾸는지(scaffold 테스트 또는 템플릿 스냅샷).
- [ ] `origin` 설정 + 다른 Origin → 403, `origin` 설정 + `Sec-Fetch-Site: cross-site`(Origin 없음) → 403.
- [ ] 힌트: 반복 요청에서도 경고 1회, 동시 요청에서 중복 없음.

기준 테스트: `pnpm test`.

종료 조건: 새 테스트 통과, 기존 hardening 시드 회귀 없음.

## Phase 6 — Integration Test: todo

Refs: RQ-PO-1, RQ-PO-4, M-PO-2, M-PO-4, M-PO-6

진입 조건: Phase 5 완료.

- [ ] conformance 시나리오 추가: 평문 http 서버에 `Host: public.example` + `Origin: https://public.example`로 POST.
      `origin: 'https://public.example'` 설정 시 200(NDJSON `done`), 미설정 시 403. 지원 런타임 전부(Workers 제외).
- [ ] 가능하면 Playwright로 로컬 TLS 프록시(예: Caddy/nginx 컨테이너) 뒤 데모 액션 클릭 시나리오.

기준 테스트: `pnpm test:conformance:app`, `pnpm test:adapters`, `pnpm test:scaffold`.

종료 조건: 전 런타임 시나리오 통과.

## Phase 7 — 엔진 변경 릴리스: todo

Refs: RQ-PO-3, RQ-PO-4, RQ-PO-5, DC-PO-4

진입 조건: Phase 3·4 중 하나 이상 완료, Phase 6 통과.

- [ ] `state-surface` 0.2.x 릴리스(`USER_PUBLISH.md`).
- [ ] Bun·Deno 템플릿이 새 엔진을 요구하면 CLI 기본 버전(`^0.2.0`) 상향 여부 결정 후 반영(DC-PO-4).
- [ ] `TEMPLATE_REF` 갱신, `create-state-surface` 다음 버전 publish.

기준 테스트: `pnpm test:scaffold`, `pnpm test:adapters`.

종료 조건: 새 CLI로 생성한 Bun·Deno 앱에서 M-PO-6 통과.
