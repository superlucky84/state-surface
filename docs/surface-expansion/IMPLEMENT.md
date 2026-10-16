# StateSurface 2.0 — 구현 계획 (IMPLEMENT)

작성일: 2026-10-14

상태: 단계 3 완료 — 모드 정규화·컴포넌트별 동적 청크·요청별 엔트리 선택·서버 전용 보호·페이지별 플러그인. 다음은 단계 4

이 문서는 [REQUIREMENTS.md](./REQUIREMENTS.md)와 [DESIGN.md](./DESIGN.md)의 결정(AG-01~09, DC-01~32)을 단계별
작업·테스트·종료 조건으로 옮긴 **실행 체크리스트**다. 결정의 정본은 DESIGN.md이며 이 문서는 결정을 바꾸지 않는다.
구현 중 결정이 바뀌어야 하면 먼저 DESIGN.md의 DC를 개정하고 이 문서를 따라 고친다.

읽기 순서: REQUIREMENTS.md → DESIGN.md → **이 문서** → [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md).

---

## 1. 진행 규칙

### 1.1 단계 순서

```text
0 기준선 → 1 서버 코어·어댑터 → 2 Page/Slot·JSX → 3 모드·manifest → 4 projection·응답·검증
  → 5 활성화·액션·pending → 6 라우터·persist·prefetch ┐
                         → 7 콘텐츠·이미지·prerender  ┴→ 8 빌드 플러그인·진단·패키징 → 9 Test Hardening → 10 Integration Test
```

- 단계 6과 7은 단계 5 종료 후 병렬로 진행할 수 있다. 둘 다 끝나야 단계 8에 들어간다.
- 단계 사이의 내부 연결(예: 단계 2의 `<Boot>`를 단계 4 전까지 기존 boot 전달 경로로 잇는 것)은 사용자 API가 아니며
  표시한 단계에서 반드시 제거한다. 하위 호환 레이어는 두지 않는다(AG-08).
- 남은 임시 연결: 없음. 단계 4의 `defineTransition(name, …)` 이름 인자와 첫 patch에서 pending을 해제하던 동작은 단계 5에서
  제거했다(DC-22·DC-16 ③·DC-11). 단계 2·3의 호스트 속성(`data-component`·`data-props`·`data-activation`·`data-media`·`data-only`)과
  `__STATE__`·`__BOOT__`·`__BASE_PATH__`·`__PLUGINS__` JSON은 단계 4에서 `__SURFACE__`로 교체했다.

### 1.2 모든 단계 공통 Exit

각 단계는 아래를 모두 만족해야 종료한다. 단계별 Exit는 여기에 추가되는 조건이다.

- [ ] `pnpm test` 전체 통과(새 테스트 포함), `pnpm format:check` 통과, `pnpm build` 성공.
- [ ] 데모 동등성 e2e(단계 0에서 작성)가 통과한다. 사용자 관점 동작이 바뀌는 시나리오(예: 단계 7의 언어 전환)는
      해당 단계에서 시나리오를 갱신하고 이유를 실행 기록에 남긴다.
- [ ] 그 단계에서 대체한 구 API의 import·사용처가 저장소에 남지 않는다(DESIGN 9.2-1). 단계별 "제거 확인" 목록을
      검색으로 확인한다.
- [ ] scaffold 원본·overrides를 같은 단계에서 갱신한다. 생성물(`scaffold/`)을 직접 고치지 않는다.
- [ ] 이 문서의 체크박스와 6장 실행 기록(날짜·커밋·테스트 수·측정값)을 갱신한다.

### 1.3 테스트 배치

| 종류         | 위치(가칭)                     | 실행                                               |
| ------------ | ------------------------------ | -------------------------------------------------- |
| 단위·통합    | 모듈 옆 `*.test.ts`(기존 관례) | `pnpm test`(Vitest + happy-dom)                    |
| 적합성(V-28) | `conformance/`                 | 코어 `handler.fetch` 직접 호출 + 어댑터별 서버     |
| 빌드 fixture | `engine/build/__fixtures__/`   | 플러그인 변환·진단 스냅샷                          |
| 브라우저 e2e | `e2e/`(Playwright, Chromium)   | production 빌드 서버 대상                          |
| 성능 측정    | `perf/`(Playwright)            | DC-17 조건, 단계 0은 보고 전용, 단계 10에서 게이트 |

### 1.4 커밋·기록

- Conventional Commits(`feat:`·`fix:`·`refactor:`·`test:`·`docs:`)를 쓰고 단계 안에서도 작은 단위로 커밋한다.
- 단계 종료 커밋 메시지에 단계 번호를 넣는다(예: `feat: complete stage 1 server core and adapters`).
- 공개 API·프로토콜이 바뀌는 단계에서 PROTOCOL.md와 공개 guide를 함께 고친다(DESIGN 9.2).

---

## 2. 구현 선택 (IC)

DESIGN이 "구현에서 정한다"로 남긴 세부 선택이다. 표시한 단계 착수 시 결정하고 근거를 이 표에 기록한다. 결정 전까지
TBD다.

| ID    | 내용                                                                        | 결정 시점    | 기본안                                                                                                                                 | 상태                                                                                                                                                                                                                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IC-01 | namespaced 지시자(`client:visible`)의 oxc·esbuild·Lithent JSX 통과(DC-07 ⑥) | 단계 2 Entry | 통과하면 그대로, 막히면 `clientVisible` 등 대체 표기를 DC-07에 개정                                                                    | 결정 (2026-10-16): namespaced 표기 유지, oxc→esbuild→Lithent 실행 통과                                                                                                                                                                                                                                                                                             |
| IC-02 | Lithent 속성 이스케이프 보강 릴리스 버전(3장)                               | 단계 2 Entry | Lithent 업스트림 패치 릴리스 후 `^` 범위 갱신                                                                                          | 결정 (2026-10-16): ^1.25.1, 속성 이스케이프 회귀 검증                                                                                                                                                                                                                                                                                                              |
| IC-03 | 직접 지시자 아일랜드 children의 정적 조각 전달 형식(DC-08)                  | 단계 2       | `<template>` 요소 + 아일랜드가 지정 위치에 삽입                                                                                        | 결정 (2026-10-16): 서버가 children을 한 번 렌더해 `<h-children style="display:contents" innerHTML>`로 컴포넌트에 넘김. 컴포넌트가 출력하지 않았거나 `client:only`면 `<template data-surface-children>`로 운반                                                                                                                                                      |
| IC-04 | 아일랜드 props의 Date·BigInt 등 추가 codec(DESIGN 2.3)                      | 단계 2       | 1차는 JSON만, 비 JSON 값은 진단                                                                                                        | 결정 (2026-10-16): 기본안. Date·Map·클래스 인스턴스·함수·BigInt·NaN/Infinity·배열 안 undefined·순환은 경로와 함께 SSR 오류, 객체의 undefined 속성은 양쪽에서 생략되므로 허용                                                                                                                                                                                       |
| IC-05 | 컴파일 배포 도구(tsc·tsup 등, DC-28 ③)                                      | 단계 8       | `tsc` emit + `exports` 맵                                                                                                              | TBD                                                                                                                                                                                                                                                                                                                                                                |
| IC-06 | idiomorph 버전 고정과 아일랜드 경계 제외 방법(DC-03)                        | 단계 4       | 고정 버전 + `beforeNodeMorphed`에서 아일랜드 루트 건너뜀                                                                               | 결정 (2026-10-16): idiomorph `0.7.4` 정확 고정. `beforeNodeMorphed(old, new)`에서 old가 `h-island`이고 new 아일랜드의 `islands` 메타데이터(componentId·props)가 기존 인스턴스와 같으면 건너뛰어 로컬 상태 유지, 다르면 교체해 기존 아일랜드 dispose 후 `islands`로 재활성화(DC-08). `instanceof Element` 가드                                                      |
| IC-07 | 적합성 테스트 하네스 구조(공통 fixture 앱·어댑터 실행 방식)                 | 단계 1       | conformance/ 공통 fixture 앱과 HTTP 시나리오를 Node·Express·Bun·Deno·workerd에서 실행; 코어는 같은 Request/Response 입력으로 직접 검증 | 결정 (2026-10-15): 문서 기본안, 실제 런타임의 스트리밍·abort와 정적 파일까지 비교                                                                                                                                                                                                                                                                                  |
| IC-08 | 성능 측정 하네스 위치·CI 러너(DC-17)                                        | 단계 0       | `perf/` Playwright + GitHub Actions Ubuntu, production 서버와 cold browser context, CPU 4x/Fast 4G, 5회 중앙값·원시값 기록             | 결정 (2026-10-15): 문서 기본안, E2E와 같은 브라우저 버전 재사용                                                                                                                                                                                                                                                                                                    |
| IC-09 | `SURFACE_SECRET`에서 토큰 암호화 키와 flash 서명 키 분리(DC-21·DC-22)       | 단계 4       | HKDF로 AES-GCM 키와 HMAC 키를 파생                                                                                                     | 결정 (2026-10-16): HKDF-SHA256으로 루트 시크릿에서 용도별 키 파생(info `state-surface/defer/v1` → AES-GCM-256, `state-surface/flash/v1` → HMAC-SHA256). `SURFACE_SECRET_PREVIOUS`도 같은 방식으로 파생해 복호화·검증에만 사용. 환경 변수가 없으면 빌드 생성 루트 키, 32바이트 미만 시크릿은 오류(옵션은 handler 생성 시, Workers binding 등 요청 env는 첫 사용 시) |
| IC-10 | 실제 SDK 검증(V-31)용 GTM·Sentry·Datadog 테스트 계정·키 보관                | 단계 10      | CI 비밀 값으로 주입, 없으면 MANUAL_TEST_CHECKLIST에서 수동 판정                                                                        | TBD                                                                                                                                                                                                                                                                                                                                                                |

---

## 3. 외부 선행 작업

### 3.1 Lithent SSR 속성 이스케이프 (단계 2 Entry 조건)

DESIGN 1장에서 확인한 대로 lithent 1.21.7의 `renderToString`은 속성값을 이스케이프하지 않는다. StateSurface가 아닌
Lithent 저장소에서 고친다. 2026-10-16 npm 최신 배포 1.25.1에서 업스트림 수정을 확인했다.

- [x] `lithent/ssr`의 속성 직렬화(`makeProp`)에서 속성값의 `&`·`"`·`<`·`>`를 이스케이프한다.
- [x] 회귀 테스트: `data-params='{"mode":"full"}'` → `data-params="{&quot;mode&quot;:&quot;full&quot;}"`,
      `title='a"b<c'`가 속성 하나로 직렬화, boolean·style·innerHTML 동작 불변.
- [x] 패치 릴리스 후 이 저장소의 lithent 의존 범위를 올리고(IC-02) `engine/server/ssrRenderer.test.ts`에 같은
      회귀 사례를 추가한다.
- [ ] (선택) async 컴포넌트가 Promise를 반환하면 dev에서 경고하는 기능을 Lithent에 제안한다(DESIGN 3.1 타입 진단 보완).

---

## 4. 단계별 계획

### 단계 0: 기준선 고정

2.0 변경 전 동작과 성능을 재현 가능하게 고정한다. 이후 모든 비교의 기준이다.

**Entry**: DESIGN DC-01~DC-32 결정 완료(충족).
**Exit**: 기준선 측정이 같은 조건에서 재현되고(5회 중앙값의 편차 기록), 데모 동등성 e2e가 현재 코드에서 통과한다.

#### 작업

- [x] 기준 커밋에서 `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`, `pnpm format:check`를 실행하고
      테스트 파일 수·테스트 수·빌드 산출물 크기를 기록한다(이전 기록: 6742026에서 34개 파일/458개 테스트).
- [x] 성능 하네스(IC-08): production 빌드(`pnpm build && pnpm start`)를 띄우고 홈 `/`, 가이드 `/guide/quickstart`,
      검색 `/examples/search`, 채팅 `/examples/chat`을 측정한다. 조건은 Chromium, CPU 4배 스로틀, Fast 4G, 압축·캐시
      고정, 5회 중앙값(DC-17).
- [x] 기록 항목: 초기 실행 JS(gzip, 파일별·합계), HTML·CSS 전송량, SSR 시간, 첫 액션(클릭 → 첫 DOM 반영), 랩 INP,
      CLS, 문서 로드 이동 시간. `perf/baseline.json`과 6장 실행 기록에 남긴다. 70% 감소 판정의 기준값이다.
- [x] CI에 성능 측정 job을 **보고 전용**으로 추가한다(실패하지 않음). 게이트는 단계 10에서 켠다.
- [x] 데모 동등성 e2e(`e2e/demo-parity`)를 작성한다: 언어 전환, 가이드 boot 스트리밍, 채팅 abort·스트리밍, streaming
      예제(full·partial·removed·error), ui-patch 예제, actions 예제(버튼·폼·scoped pending), search, view-transition 예제,
      BASE_PATH(`BASE_PATH=/demo`), 플러그인(Prism·목차·채팅 스크롤). 사용자 관점 결과(DOM 텍스트·URL·요청 수)만
      검증하고 내부 구조에 의존하지 않는다.
- [x] 위험 선확인(spike, 결과를 실행 기록에 남김): IC-01 namespaced 지시자 통과, Lithent hydration이 사용자 입력
      value·커서를 SSR 값으로 되돌리지 않는지(V-04 전제), `moveBefore` 지원 브라우저 범위(DC-19), idiomorph 아일랜드
      경계 제외(IC-06).

#### Baseline 테스트

- [x] 기존 `pnpm test` 전체 통과.
- [x] 데모 동등성 e2e가 현재 코드의 production 빌드에서 통과.
- [x] 성능 하네스 2회 실행의 중앙값 차이가 기록됨(측정 노이즈 범위 확인).

---

### 단계 1: 서버 코어·어댑터 (DC-27, DC-28)

Express 결합을 걷어내고 웹 표준 코어(`Request → Response`)와 5개 어댑터를 만든다. 페이지 형식은 아직 기존 문자열
layout이지만 사용자 API는 `ctx` 기반으로 일괄 전환한다. DESIGN 11장.

**Entry**: 단계 0 Exit. IC-07 결정.
**Exit**: 적합성 테스트가 5개 어댑터에서 통과하고 전환 전 Express 결과와 같다(차이는 `data-ssr-hash` 제거뿐).
코어 번들에 `node:*`·express import가 없다.

#### 코어

- [x] `engine/server/core/`(가칭)에 `createHandler({ manifest, basePath, security, bodyLimit, logger, onError,
middleware })` → `{ fetch(request, platform) }`를 만든다.
- [x] 라우팅: 빌드 manifest의 경로 패턴으로 페이지 GET·`POST /transition/:name`·404를 처리한다. 지연 슬롯·액션·
      prerender 경로는 단계 4·5·7에서 추가한다.
- [x] `SurfaceContext`: `request`·`url`·`params`·`cookies`(get/set/delete → `Set-Cookie`)·`locals`·`env`·`signal`
      (클라이언트 abort + timeout 결합)·`platform`·`route.kind`. 요청마다 `nonce`를 만든다(사용은 단계 2).
- [x] 미들웨어 `onRequest(ctx, next)`와 `sequence()`. 조기 반환과 응답 가공을 지원한다.
- [x] 쿠키 쓰기 시점: 페이지 SSR은 Response 생성 전까지, transition은 첫 프레임 yield 전까지. 이후 호출은 무시하고
      dev에서 경고·trace를 남긴다(DC-27).
- [x] transition 응답: async generator를 `ReadableStream` NDJSON으로 감싸고 `request.signal` abort 시
      `generator.return()`을 호출한다. 기존 timeout·done·error 처리를 그대로 옮긴다(한도 개정은 단계 4).
- [x] body 크기 한도(기본 100KB)를 스트림을 읽으며 강제하고 초과 시 413을 응답한다.
- [x] CSRF: 모든 POST에서 `Origin`(없으면 `Sec-Fetch-Site`)이 같은 origin인지 검사하고 다르면 403. 허용 origin 목록
      옵션. DC-22 ④를 코어 공통 검사로 먼저 적용한다.
- [x] 모르는 요청 헤더를 거부하지 않는다. `onError(err, ctx)`로 SSR·transition 스트림 중간 오류를 전달한다(8.3-4·5).
- [x] `process.env` 직접 읽기를 없애고 옵션·`ctx.env`로 받는다. logger는 주입한다.
- [x] SSR 해시(`data-ssr-hash`, `node:crypto`)를 제거하고 관련 테스트를 고친다(DESIGN 11.2).

#### 빌드 registry

- [x] 최소 Vite 플러그인이 route·transition·asset manifest를 정적 import하는 서버 엔트리를 생성한다. 실행 중
      `readdir`·`fs.readFileSync`(`routeScanner.ts`·`bootstrap.ts`·`assets.ts`)를 없앤다.
- [x] dev는 Vite SSR 모듈 로드로 같은 manifest 생성 함수를 호출하고, 코어 핸들러를 Vite dev 서버에 연결한다(DC-28 ④).

#### 어댑터 (`state-surface/adapters/*`)

- [x] `node`: `node:http` ↔ Request/Response 변환, 정적 파일 서빙(캐시 헤더), graceful shutdown(`gracefulShutdown.ts`
      이전), CLI 실행. 기본 어댑터.
- [x] `express`: `app.use(surface())`. 원시 요청 스트림을 읽으며, 앞선 body parser와 함께 쓸 때의 순서를 가이드한다.
- [x] `bun`: `Bun.serve({ fetch })`, `Bun.file` 정적 서빙.
- [x] `deno`: `Deno.serve(handler)`, 정적 서빙, 권한 플래그(net·read·env) 문서화.
- [x] `cloudflare`: `export default { fetch }`, Workers Static Assets, `platform.env`.
- [x] 어댑터 계약 `{ name, serverEntry, readStatic, supports }` 타입을 정의한다(`readStatic` 사용은 단계 7).
- [x] `surface({ adapter })` 옵션(기본 node), `express`를 optional peerDependency로, `package.json` `exports`에
      어댑터 subpath 추가(컴파일 배포는 단계 8).

#### 사용자 코드 일괄 전환

- [x] `RouteModule`의 `params(req)`·`initial(req)`·`boot.params(req)`를 ctx로 바꾸고, `shared/i18n.ts`를
      `getLang(ctx)`로 바꾼다.
- [x] `routes/_shared/hooks.ts`와 `TransitionHooks`를 제거하고 `switch-lang` transition이 첫 yield 전에
      `ctx.cookies.set`으로 쿠키를 쓴다.
- [x] 저장소 루트 `server.ts`를 node 어댑터 엔트리로 바꾸고 scaffold overrides의 `server.ts`도 갱신한다.

#### CI

- [x] 적합성 스위트(`conformance/`): SSR·transition 스트림·abort·404·BASE_PATH·cookie·미들웨어 조기 반환/가공.
      전환 전 Express 결과를 스냅샷으로 고정해 비교한다. 이후 단계에서 시나리오를 추가한다.
- [x] CI 매트릭스: Node(기본)·Bun·Deno, Workers는 production 빌드를 `wrangler dev`(workerd)로 실행해 같은 스위트.
- [x] 코어 번들 검사: lint 규칙과 번들 스캔으로 `node:*`·express import 0을 확인한다.

#### Baseline 테스트

- [x] 기존 서버 테스트(`routeHandler`·`transition`·`basePath.integration`·`demoIntegration` 등)를 코어 경유로 이전해 통과.
- [x] ctx 쿠키 시점 규칙, 미들웨어 합성, CSRF 403, body 413, abort 시 generator 종료 단위 테스트.
- [x] 적합성 스위트가 5개 어댑터에서 통과.

#### 제거 확인

`createApp`(Express 조립), `express` 타입 import, `hooks.ts`·`TransitionHooks`, `req` 기반 route API, `data-ssr-hash`,
런타임 fs 스캔.

**검증 ID**: V-28(전환 전 Express 결과와 동일), V-29 일부(코어 번들·실행 중 fs 접근 없음, 콜드 스타트 기록은 단계 10).

---

### 단계 2: Page/Slot·JSX (DC-01, DC-07, DC-08, DC-15, DC-29, DC-31)

문자열 layout을 `.tsx` 페이지와 `<Slot>`으로 바꾸고, Lithent 제약에 맞는 렌더 파이프라인(호출 지점 변환·트리 순회
수집·`load` 대기·문서 조립)을 만든다. DESIGN 2장·3장·4.3·4.4.

**Entry**: 단계 1 Exit. 3.1 Lithent 속성 이스케이프 반영(IC-02). IC-01 결론.
**Exit**: 데모 전 페이지가 `.tsx` 페이지로 동작하고 SSR 결과가 단계 1과 의미상 같다(허용 차이: doctype·주석 마커·
관리 태그 위치). 병렬 요청 교차 테스트에서 수집 데이터가 섞이지 않는다.

#### 페이지·공개 API

- [x] 라우트 탐색: `routes/**/*.tsx`(`_`로 시작하는 파일·폴더 제외), 같은 URL 충돌과 default export 없음은 빌드
      오류(DC-16).
- [x] 페이지 계약 `export default async (ctx) => JSX`, named export `prerender`·`getStaticPaths`·`plugins` 타입.
- [x] `state-surface` 공개 API: `Slot`, `Boot`, JSX 타입 선언(namespaced 지시자, Slot 속성, Promise 반환 컴포넌트 거부).
- [x] `state-surface/server`: `defineServerComponent({ load, render })`(DC-29), `SurfaceContext` 타입.

#### 빌드 플러그인(최소판)

- [x] oxc-parser pre transform: 직접 지시자 엘리먼트와 `<Slot>`의 자식 엘리먼트를 디스크립터 생성 호출로 바꾼다
      (DESIGN 3장). 정적 import 식별자만 허용하고 componentId(모듈 경로 + export 이름)를 만든다. 소스맵을 유지한다.
- [x] 기본 진단: Slot 자식 0개·2개 이상·children·Slot-in-Slot·계산된 아일랜드·Slot 밖 `defineServerComponent`·
      client 아일랜드 안 `<Boot>`·이름 형식. 메시지 형식 완성은 단계 8.

#### 렌더 파이프라인

- [x] 페이지 함수 await → 반환 트리를 동기 순회해 Slot·아일랜드·`<Boot>`·`defineServerComponent`를 수집한다. 렌더 중
      부수효과 등록이나 모듈 전역 수집기를 쓰지 않는다.
- [x] server 슬롯의 `load`를 모아 `Promise.all`로 기다린 뒤 렌더한다. `load` 실패는 오류 응답·`onError`로 처리한다.
- [x] 문서 조립(4.4): 자리표시 토큰 치환, `<!doctype html>`, head·body 주석 마커, 관리 태그 순서(CSS → modulepreload →
      bootstrap JSON → 앱 엔트리 → 엔진 엔트리), 엔진 script에 nonce, html·head·body 누락·중복 진단.
- [x] Slot 이름 규칙(DC-08): 형식, 페이지 단위 중복(빌드·SSR), `#` 예약.
- [x] client 아일랜드 props 직렬화: 공개 props만, JSON 불가 값 진단(IC-04). children 정적 조각 전달(IC-03).

#### 클라이언트 연결

- [x] `defineTemplate` 이름 registry와 `engine/client/templates/auto.ts` eager glob을 componentId registry로 바꾼다.
      단계 3 전까지는 가상 모듈이 모든 아일랜드를 eager로 담는다(단계 3에서 동적 청크로 교체).
- [x] `<Boot>`(DC-31): 수집 결과를 단계 4 전까지 기존 boot 전달 경로로 넘기고, 클라이언트 boot 실행부를 배열·문서
      순서 실행으로 확장한다. 단계 4에서 `__SURFACE__.boot`로 교체한다.

#### 데모 전환

- [x] `routes/**/*.ts`와 `layouts/surface.ts`(`stateSlots`·`joinSurface`·`surfaceDocument`·`baseSurface`)를
      `routes/**/*.tsx` 페이지와 `layouts/Layout.tsx`로 바꾼다. 기존 `templates/*.tsx`는 Slot 자식 컴포넌트로 옮긴다.
- [x] `initialStates.ts`(initial > transition > empty)를 제거한다. 초기값은 페이지 함수가 props로 준다. 가이드 페이지는
      로딩 상태 SSR + `<Boot transition="guide-load" …/>`로 현재 동작을 유지한다(단계 7에서 prerender로 대체).
- [x] scaffold overrides의 route·layout도 같은 형식으로 바꾼다.

#### Baseline 테스트

- [x] 플러그인 변환 fixture 스냅샷(지시자·Slot 자식·import 형태별)과 진단 fixture.
- [x] 병렬 요청 교차: 두 요청이 await 사이에서 교차해도 각 응답의 슬롯·props·boot가 자기 것만 담긴다.
- [x] `client:only` 컴포넌트가 서버에서 호출되지 않음(호출 감지 spy).
- [x] `load` 병렬 대기(동시 시작 확인)와 실패 시 오류 응답.
- [x] 문서 조립 스냅샷(마커·순서·nonce)과 Lithent 속성 이스케이프 회귀(`data-params` JSON 왕복).

#### 제거 확인

`layout(stateScript)`, `stateSlots`, `joinSurface`, `surfaceDocument`, `baseSurface`, `fillHState` 정규식,
`initialStates.ts`, `defineTemplate`, `auto.ts` eager glob.

#### 임시 연결 (단계 3·4에서 제거)

- `mode`를 생략한 Slot은 단계 3 모드 정규화 전까지 기존과 같이 SSR + `__STATE__` hydration + 클라이언트 갱신으로 동작한다.
  명시한 `mode="server"`·`mode="static"`은 SSR 전용이며(server HTML 갱신은 단계 4) 클라이언트 상태를 보내지 않는다.
- 슬롯 호스트는 `<h-state name data-component="componentId">`로 컴포넌트를 알린다. 직접 지시자 아일랜드는
  `<h-island data-island="$N" data-component data-props [data-only]>`이며 시점과 무관하게 로드 시 활성화한다(scheduler는 단계 5).
  단계 4의 `__SURFACE__.slots`가 이 속성들을 대체한다.
- `<Boot>`는 `__BOOT__` JSON 배열(문서 순서)로 전달하고 클라이언트가 순서대로 실행한다. targets 없는 boot가 둘 이상이면
  서로 abort하므로 dev에서 경고한다. 단계 4에서 `__SURFACE__.boot`, 단계 5에서 액션 런타임으로 옮긴다.

#### 계획 조정 (2026-10-16)

- 빌드 fixture는 `engine/build/transform.test.ts`의 메모리 프로젝트(가상 파일 + 해석기)와 스냅샷
  (`engine/build/__snapshots__/`)으로 둔다. 진단 fixture가 의도적으로 잘못된 코드라 저장소 `tsc` 대상에 넣지 않기 위해서다.
- DC-16 ③(transition을 루트 `transitions/**/*.ts`로 옮기고 경로를 이름으로 쓰는 규칙)은 어느 단계에도 배정되지 않았다.
  transition 이름·입력 타입을 바꾸는 단계 5(`defineTransition({ input, targets, … })`·`actions.d.ts`)에서 함께 수행한다.
  단계 2는 `routes/**/transitions/*.ts` 탐색을 유지한다.
- 데모 가이드 본문(`shared/content.ts`)의 구 API 설명은 단계 7 "가이드 본문을 2.0 API로 다시 쓴다"에서 콘텐츠 컬렉션 이행과
  함께 고친다. 단계 2는 README·CLAUDE.md·AGENTS.md·scaffold README·서버 가이드를 갱신한다(PROTOCOL은 wire 불변).
- 단계 1의 정확한 Express 문자열 비교(`conformance/legacy.mjs`)는 의도된 속성 이스케이프 변경 이후 맞지 않으므로
  단계 1 production 산출물 의미 비교(`pnpm test:parity`, `conformance/stage1-demo.json`)로 바꿨다.

**검증 ID**: V-03, V-10(SSR 속성 이스케이프 부분), V-11, V-15.

---

### 단계 3: 모드·manifest (DC-02, DC-03, DC-12, DC-16)

static·server·client 모드를 나누고 컴포넌트별 동적 청크, 서버 전용 보호, 요청별 엔트리 선택, 페이지별 플러그인을
만든다. DESIGN 3장·4.1·4.2·5.1.

**Entry**: 단계 2 Exit.
**Exit**: 라우터·액션·boot·플러그인 없는 static 페이지의 엔진 JS가 0이고, client 아일랜드가 없는 페이지는 Lithent를
로드하지 않으며, client 산출물에 서버 전용 sentinel이 없다.

#### 작업

- [x] 모드 정규화(4.1): 지시자 없음 → static, client 지시자 → client, `client:only` → SSR 생략, 모순 조합 진단,
      capability 기본 strict 메타데이터.
- [x] 아일랜드마다 동적 `import()` 청크, `virtual:state-surface/islands`(componentId → loader), 빌드 manifest의 청크
      CSS·preload 연결. `client:load` 청크만 modulepreload. 요청에서 실제 렌더된 아일랜드만 bootstrap에 넣는다.
- [x] 서버 전용 보호(DC-02): `state-surface/server-only` 마커·`*.server.ts(x)`·`node:*`가 client 전이 의존성에 들어오면
      import 경로 체인과 함께 빌드 실패. 마커 모듈은 client에서 import되면 throw.
- [x] 요청별 엔트리 선택(5.1): 엔진 script 없음 / 액션 런타임 / scheduler + metadata / `client:load` 청크.
- [x] 앱 엔트리 `client/entry.ts`(DC-18 ①, 8.3-1): 있으면 모든 페이지에서 엔진 전에 실행. `surface({ clientEntry })`.
- [x] 클라이언트 플러그인(DC-12): `definePlugin({ name, slots, load, attach, update })`, 페이지·레이아웃
      `export const plugins` 수집 → 플러그인별 청크 → 선언 페이지만 로드, 늦은 로드 시 표시된 슬롯 전부 attach.
      `client/main.ts`의 전역 플러그인 로드와 `onInit`·`onTransitionStart/End`를 제거하고 `onPage`·`onAction`(가칭)을
      제공한다. replace·morph 시점 훅은 단계 4, 라우터 시점은 단계 6에서 연결한다.
- [x] 데모 모드 지정: 갱신 없는 영역(홈 hero·concepts·features 등)은 static. transition으로 갱신되는 슬롯은 server HTML
      갱신이 생기는 단계 4 전까지 client 모드로 둔다.
- [x] dev와 build가 같은 분석·manifest 생성 함수를 호출한다(DC-16).

#### Baseline 테스트

- [x] V-05 sentinel 스캔: 서버 전용 모듈에 넣은 sentinel 문자열이 client 산출물 전체에 없다.
- [x] 빌드 실패 fixture: 서버 전용 모듈을 client 아일랜드가 간접 import → 경로 체인 메시지.
- [x] e2e: 홈(static)의 엔진 JS 요청 0(라우터 없는 fixture), Lithent 청크는 아일랜드 페이지에서만, `client:load` 외
      청크는 트리거 전 요청 없음.
- [x] 플러그인: 선언 페이지만 로드, 늦은 로드 attach, cleanup 호출 순서.

#### 제거 확인

`auto.ts` eager 맵(단계 2의 임시 eager 가상 모듈 포함), `client/main.ts` 전역 플러그인 등록, `onInit`·
`onTransitionStart/End`, 단계 2의 "`mode` 생략 Slot = client" 임시 동작.

#### 임시 연결과 계획 조정 (2026-10-16)

- 데모 모드: `switch-lang` transition이 모든 페이지의 모든 슬롯을 full 프레임으로 갱신하므로 "transition으로 갱신되는 슬롯은
  단계 4 전까지 client" 원칙에 따라 홈 hero·concepts·features를 포함한 데모 전 슬롯을 `client:load`로 둔다(작업 목록의
  "홈 hero 등은 static" 예시는 이 원칙과 충돌). static·엔진 JS 0은 `e2e/modes` fixture 앱으로 검증한다. 단계 4의 server 모드
  전환과 단계 7의 경로 기반 언어 전환에서 다시 줄인다.
- 활성화 scheduler는 최소판이다: 시점(load·idle·visible·media)과 `client:only`만 구현했다. 활성화 전 첫 상호작용 즉시
  활성화·청크 재시도·buildId 재로드는 단계 5다. 휴면 슬롯에 프레임이 오면 즉시 활성화하고 SSR snapshot으로 hydrate한 뒤
  최신 props를 적용한다(DC-05의 일부를 미리 구현). `data-action` 첫 클릭·submit은 로더가 이벤트 시점에 snapshot해 런타임
  로드 후 1회 실행한다(DC-04 ⑦).
- 플러그인 시점: SSR 표시(static·server 슬롯)·client 활성화·render → `attach`, client props 갱신 → `update`, removed →
  cleanup. replace·morph는 단계 4, 라우터는 단계 6. 페이지가 플러그인 모듈을 import하므로 플러그인 정의 모듈은 서버에서도
  import된다(모듈 최상위에서 DOM에 접근하지 않는다). `load`·`slots`는 빌드가 읽는 리터럴이어야 한다.
- 엔진 엔트리는 엔진 소유 `engine/client/loader.ts`다. `client/main.ts`와 `createStateSurface`를 제거했고 앱 코드는
  `client/entry.ts`(선택)에 둔다. 플러그인이 client 빌드 입력(로더·styles·app entry)을 주입하고 Vite의 동적 import preload
  helper 기본값을 끈다(`build.modulePreload: false`, 서버가 페이지별 modulepreload를 쓰므로).
- 로더 크기: gzip 4,818 B(목표 2KB, DC-04 ⑥ 보고 항목). Vite의 동적 import 래퍼와 componentId 로더 맵이 대부분이다. 단계 5
  scheduler 완성 때 다시 측정·축소한다.
- 서버 전용 검사: build는 client 그래프 전체(`buildEnd`)에서 경로 체인을, dev는 import 시점에 importer를 보고한다(Vitest의
  DOM 환경은 의도적으로 서버 코드를 섞으므로 제외).

**검증 ID**: V-01, V-03, V-05, V-06.

---

### 단계 4: projection·응답·검증 (DC-09, DC-10, DC-13, DC-14, DC-21, DC-06 인페이지)

두 층 wire, 요청 reducer와 server HTML projection, 검증·한도·capability, 지연 server 슬롯, bootstrap 통합과 버전 검사,
인페이지 View Transition 규칙을 만든다. DESIGN 6장·8장·9.1·10.4.

**Entry**: 단계 3 Exit. IC-06·IC-09 결정.
**Exit**: 구 StateFrame wire와 `__STATE__`·`__UI__`·`__BOOT__`·`__BASE_PATH__` 사용처가 0이고, 데모의 서버 갱신 슬롯이
server 모드 HTML로 동작한다.

#### 서버: 작성 층·projection

- [x] 작성 층 validator: full은 targets 범위 교체, 첫 상태 프레임은 full, `done` 작성 금지, changed·removed 규칙. dev는
      원본 위치와 함께 throw, production은 `error` 프레임 후 종료(DC-14).
- [x] 요청 reducer(`applyFrame` 재사용)와 슬롯 모드별 projection: server → `html`(렌더마다 `load` 재실행),
      client → `props`·`merge`. 혼합 프레임은 patch 하나. server 렌더는 첫 갱신 즉시·이후 최대 33ms 1회·done/error 전
      최종 렌더(DC-10).
- [x] targets: 선언 targets 또는 첫 full 프레임 키로 고정하고 대상 밖 op를 거부한다.
- [x] handler 정상 종료 시 엔진이 `done`을 보낸다. async 함수 반환은 `{ frames: [patch, done] }` JSON 단건.
- [x] pageId: 빌드가 페이지별 page manifest(slot → componentId·mode·swap·capability)를 만들고 `X-Surface-Page`로
      해석한다. 누락·미등록은 400.
- [x] `html` op의 `islands`(server 슬롯 안 직접 지시자 아일랜드 메타데이터).
- [x] 오류 슬롯 규칙: `error` 프레임의 slot은 targets와 무관하게 허용.
- [x] 타임아웃 idle 30초·전체 5분, 한도(body 100KB·한 줄 1MB·총 32MB·op 1만·html op 512KB), dev 80% 경고, 초과 시
      `error` + `generator.return()`(DC-14). dev server 재렌더 경고 임계치.
- [x] 외부 프레임 헬퍼 `ctx.external(source)`: `external` 슬롯·Standard Schema 강제, 위반 프레임은 버리고 trace.

#### 서버: bootstrap·버전

- [x] `__SURFACE__` JSON 하나(`buildId`·`pageId`·`basePath`·`slots`·`ui`·`boot`)로 통합하고 `<`·`>`·`&`·U+2028·U+2029를
      이스케이프한다. 단계 2의 `<Boot>` 임시 연결을 `__SURFACE__.boot`로 바꾼다.
- [x] `X-Surface-Build` 헤더 검사: 불일치 409 → 브라우저가 현재 URL을 문서 로드로 다시 연다.

#### 브라우저: 적용 파이프라인

- [x] op를 배열 순서대로 실행하고 상태표(awaiting-baseline → active → completed·failed·aborted, done만 오는 빈 성공)를
      따른다. 콘텐츠 op 위반은 중단, `ui` op 위반은 건너뛰고 trace. coalesce(슬롯별 마지막 `html`·`props`, `merge` 합침),
      요청 generation 무효화.
- [x] server 슬롯 HTML(DC-03): `swap="replace"`(플러그인 cleanup → 교체 → attach, 내부 아일랜드 dispose →
      `islands`로 재활성화, `id` 기반 포커스·선택·스크롤 복원), `swap="morph"`(idiomorph, 아일랜드 경계 제외, 해당
      페이지에서만 로드), HTML 안 `<script>` 미실행과 dev 경고.
- [x] 오류 슬롯이 없는 페이지: 화면 표시 없이 액션 오류·`reportError`로 전달하고 dev 경고.
- [x] 인페이지 View Transition(DC-06): 기본 즉시 반영(현재 `sync()`의 전면 `startViewTransition` 제거), 액션
      `viewTransition`·`data-view-transition`, `<Slot viewTransition>`(첫 등장 포함), patch 단위 1회, 진행 중 후속 프레임
      즉시 적용, reduced motion·미지원 시 즉시.
- [x] transition 요청은 호출 시점에 전역 `fetch`를 조회하고 예상 밖 오류를 `reportError`로 전달한다(8.3-2·3).

#### capability·안전성 (DC-13)

- [x] strict: 텍스트·속성 이스케이프(Lithent 보강)와 URL 속성(`href`·`src`·`action`·`formaction`) scheme 검사.
- [x] rich: mdast → hast allowlist 렌더러(raw HTML 차단). 단계 7 콘텐츠 컬렉션과 공유한다.
- [x] unsafe: 명시 opt-in, `<script>` 미실행, `sandbox="iframe"`이면 `srcdoc` 격리.
- [x] UI 패치 검증: 클래스 토큰 `[A-Za-z0-9_:/\[\].-]+`, `cssVars` 키 `--` 시작·값 금지 문자, 잘못된 `ui.classAdd` 타입
      결함 수정, SSR UI 속성 이스케이프.

#### 지연 server 슬롯 (DC-21)

- [x] SSR: `server:defer` 슬롯에 fallback과 AES-GCM 토큰(componentId·slotId·buildId 포함)을 출력한다. 루트 키는 빌드 자동
      생성, `SURFACE_SECRET`(+`SURFACE_SECRET_PREVIOUS`)이 있으면 사용, IC-09 HKDF로 flash 키와 분리(32바이트 미만 오류).
- [x] `GET {BASE_PATH}/_surface/island/:componentId?p=`(토큰 2KB 초과 시 POST): 복호화·검증, 미들웨어 통과(쿠키·권한
      재확인), `load` 실행, HTML + `islands` 응답. 기본 `Cache-Control: private, no-store`, `cache` 속성으로 opt-in.
- [x] 브라우저: 페이지의 지연 슬롯 병렬 요청, revision 비교로 늦은 응답 폐기, 1초 뒤 1회 재시도 후 fallback 유지와
      `reportError`.

#### 데모·문서

- [x] 데모의 서버 갱신 슬롯(검색 결과, streaming 예제 등)을 server 모드로 바꾼다. 토큰 스트리밍(채팅 메시지 등)은
      client 모드 `merge`를 유지한다. 데모 transition의 작성 프레임을 새 규칙(첫 full, done yield 없음)으로 고친다.
- [x] `PROTOCOL.md`를 두 층 계약으로 다시 쓰고, `docs/ui-protocol/DESIGN.md`에 대체 관계를 표시한다.

#### Baseline 테스트

- [x] protocol: 작성 층 위반 사례(partial first, done yield, targets 밖, changed/removed 충돌), reducer·projection 스냅샷,
      coalesce·한도·타임아웃.
- [x] 브라우저 런타임: 상태표 전이, 빈 성공, 콘텐츠·ui op 위반 처리, generation 무효화, replace·morph 포커스 보존.
- [x] 적합성 스위트에 지연 슬롯·pageId·409 시나리오 추가.
- [x] 악성 입력 1차 세트(속성 breakout, `javascript:` URL, rich 우회, cssVars) 차단.

#### 제거 확인

구 StateFrame 직접 적용 경로(브라우저의 full·partial 해석), `__STATE__`·`__UI__`·`__BOOT__`·`__BASE_PATH__`, `sync()`의
전면 View Transition 래핑, 단계 2의 `<Boot>` 임시 연결, 단계 2·3의 `data-component`·`data-props`·`data-activation`·
`data-media`·`data-only` 호스트 속성과 `__PLUGINS__` JSON.

#### 임시 연결과 계획 조정 (2026-10-16)

- `defineTransition` 형태: 단계 5(DC-22)의 객체형 전에 `defineTransition(name, handler | { targets, viewTransition, handler })`
  로 targets·액션 단위 View Transition을 받는다. 단계 5에서 이름 인자를 없애고 `input`·`mode`·`flash`를 더한다.
- 오류 슬롯: 페이지 manifest에 `system:error`(설정 `createHandler({ errorSlot })`)가 있으면 `error` 프레임이 그 슬롯의
  렌더 결과를 함께 싣는다(server 슬롯은 `html`, client 슬롯은 `props`). 다음 요청의 baseline에서 브라우저가 비운다.
  공개 메시지는 `TransitionError`(state-surface/server)로 던지고, 그 밖의 오류는 production에서 `Transition failed`다.
- 액션 단위 View Transition은 응답 헤더 `X-Surface-View-Transition: 1`로 알린다(프레임 형식 변경 없음).
- `__SURFACE__`: `{ buildId, pageId, basePath, slots, boot, plugins }`. 단계 3의 `__PLUGINS__`를 `plugins`로 옮겼고, SSR 초기
  UI를 만드는 경로가 단계 2 이후 없으므로(호스트 `class`·`style`로 대체) `ui` 필드는 쓰지 않는다. 아일랜드 id는 페이지 수준
  `$N`, 슬롯 안 `<slot>$N`이며 슬롯 메타데이터와 같은 배열에 둔다. 엔진이 없는 페이지에 앱 엔트리만 있으면 build·page·basePath만
  쓴다(`__BASE_PATH__` 대체). 지연 슬롯 메타데이터에는 엔드포인트 경로용 componentId를 둔다.
- buildId: build는 client 자산 manifest의 SHA-256 앞 16자, dev는 서버 시작마다 무작위. 빌드 생성 루트 비밀은 빌드마다 32바이트
  무작위로 서버 번들에 넣는다. `X-Surface-Build`가 없거나 다르면 409, `X-Surface-Page`가 없거나 모르면 400이다.
- IC-06 구현: 단계 4에서 호스트 `data-component`·`data-props`를 없앴으므로 morph 비교는 `islands` 메타데이터(componentId·props)와
  기존 인스턴스를 비교한다. 같으면 인스턴스를 새 id로 옮기고, 포커스된 입력의 값은 idiomorph `ignoreActiveValue`로 유지한다.
- 브라우저 클라이언트 타임아웃(30초)은 제거했다. 서버의 idle 30초·전체 5분이 정본이다(DC-14). 첫 프레임 전 실패는 500에
  오류 프레임 본문을 담는다.
- 데모: 모든 슬롯이 server 모드다. 채팅만 `chat:current`를 client 슬롯(`merge` 토큰 스트리밍)으로 둔다. 서버가 요청마다 빈
  상태에서 시작하므로(DC-10) 채팅 기록은 데모용 서버 저장소(`history.server.ts`, 세션 쿠키)에서 읽고, 검색 입력은 `swap="morph"`로
  입력·포커스를 유지한다. `guide-load`는 targets를 선언하고, `vt-demo`는 `viewTransition: true`다.
- 가이드 본문(`shared/content.ts`)의 `__UI__`·`__STATE__` 설명은 단계 7의 가이드 재작성 범위다(코드 사용처는 0).
- capability strict의 URL 정화는 서버 렌더(SSR·`html` op·지연 응답)에서 한다. 브라우저 Lithent 렌더(client 슬롯) 경로는
  대상이 아니다. rich 렌더러는 `state-surface/rich`의 `Markdown`(mdast-util-from-markdown 2.0.3·mdast-util-to-hast 13.2.1)이다.

**검증 ID**: V-02, V-07, V-08, V-09, V-10, V-23.

---

### 단계 5: 활성화·액션·pending (DC-04, DC-05, DC-11, DC-22, DC-30)

아일랜드 활성화 scheduler, 로컬 상태 수명, 컴포넌트 액션 API와 동시성, 타입 지정 transition과 JS 없는 폼을 만든다.
DESIGN 5.2·5.3·7장·10.5·2.5.

**Entry**: 단계 4 Exit.
**Exit**: 활성화 경쟁·로컬 상태·액션 동시성·PRG 시나리오가 통과하고 첫 프레임에서 pending을 해제하던 동작이 없다.

#### 활성화·로컬 상태

- [x] scheduler(DC-04): `load` 즉시, `idle`은 `requestIdleCallback`(timeout 2초, 미지원은 load 후 200ms), `visible`은
      IntersectionObserver(rootMargin 200px), `media`는 `matchMedia`, 관찰자 미지원은 idle 대체. 시점 지시자 중복은 빌드 오류.
- [x] 활성화 전 `pointerdown`·`focusin`·`keydown` 감지 시 즉시 활성화, SSR DOM 재사용으로 입력 보존(단계 0 spike 결과
      반영), 클릭 재생 없음.
- [x] 청크 로드 실패: 1초 뒤 1회 재시도, 실패 시 SSR·fallback 유지와 `reportError`. buildId 불일치면 다음 조작 시 재로드.
- [x] 휴면 중 프레임: reducer로 최신 props 보관, 활성화 시 snapshot hydrate → 최신 props 갱신, reset·resetKey 변경 시
      새 mount. 모듈 로드 promise는 componentId로 공유, generation이 바뀌면 mount하지 않음.
- [x] 로컬 상태(DC-05): DataProxy 재사용, `resetKey`(prop 이름·배열), 작성 층 `reset: [slotId]` → `props` op
      `reset: true`, server 슬롯 reset 진단.

#### 액션 런타임

- [x] `useAction(renew, name, options?)` → `{ run, abort, pending, hasResult, error, aborted }`, `run()`은 throw 없는
      결과 Promise, `error.kind`(timeout·http·protocol·chunk·server·validation). unmount 시 구독만 해제.
- [x] 동시성(DC-11·DC-30): 같은 이름 또는 targets가 겹치면 이전 요청 abort, 나머지 병렬, `mode: 'queue'`. targets 생략은
      모든 슬롯과 겹침으로 보고 dev 경고 1회. targets는 빌드 manifest로 전달한다.
- [x] pending: 요청 ID별 `data-pending`(완료까지)과 `data-has-result`, `data-pending-targets`, targets 생략 시 전체 슬롯.
- [x] 이벤트: 컴포넌트가 `preventDefault()`한 이벤트는 위임하지 않음, 한 이벤트 한 액션, submit은 submitter·다중 값을
      이벤트 시점에 snapshot.
- [x] `<Boot>` 실행을 액션 런타임으로 옮긴다(일반 액션과 같은 규칙, targets 없는 boot 복수 시 dev 경고).

#### 타입 지정 transition·PRG (DC-22)

- [x] `defineTransition({ input, targets, mode, flash, handler })`, Standard Schema 검증(실패 시 handler 미실행·
      `fieldErrors`), form-urlencoded·multipart → 객체(같은 이름은 배열).
- [x] `.state-surface/actions.d.ts` 생성(dev는 파일 변경 시 갱신): 이름 → 입력·결과 타입. `useAction`·`<Boot>` 타입 연결.
- [x] DC-16 ③: transition을 루트 `transitions/**/*.ts`로 옮기고 디렉터리 기준 상대 경로를 이름으로 등록, 중복은 빌드 오류.
      `routes/**/transitions/` 탐색과 `defineTransition(name, …)`의 이름 인자를 제거한다(단계 2 계획 조정).
- [x] `POST {BASE_PATH}/_surface/action/:name` → 실행(프레임 버림) → 303. `_redirect`는 같은 origin·BASE_PATH 경로만,
      아니면 같은 origin `Referer`, 그것도 아니면 BASE_PATH 루트.
- [x] flash: IC-09 키로 서명한 일회성 쿠키, 기본은 검증 오류·결과만, 입력값은 `flash.input`에 명시한 필드만, file 값
      제외, 3KB 한도(초과 시 입력값 → 오류 요약 순으로 축소, dev 경고). `ctx.flash(name)`, `actionUrl()` 헬퍼.
- [ ] prerender 페이지에 액션 폼이 있으면 JS 없는 결과 표시 한계를 빌드 경고로 알린다(단계 7에서 prerender 도입 후 활성).
      → 단계 7로 이월(prerender가 아직 없어 판정 대상이 없다).

#### 데모

- [x] actions 예제에 `useAction`·타입 지정 transition·JS 없는 폼 시연을 추가한다. 동시성(검색 중 좋아요 등) 시연 슬롯을
      둔다.

#### Baseline 테스트

- [x] scheduler 시점별·미지원 대체·조작 시 즉시 활성화, 로드 실패 재시도.
- [x] 휴면 delta 후 활성화(snapshot → 최신), 제거 후 로드 완료 시 mount 안 함, resetKey·reset.
- [x] 단계 0 spike에서 확인한 입력값·커서 덮어쓰기를 보완하고 V-04 브라우저 회귀 테스트로 검증한다.
- [x] 동시성 매트릭스: 같은 이름, 겹치는 targets, 겹치지 않는 targets, targets 생략, queue.
- [x] PRG: 303·flash·리다이렉트 검증·크기 한도·file 제외, JS 있음과 없음의 결과 동일.

#### 제거 확인

첫 프레임 pending 해제, 전역 abort-previous(targets 선언 액션 기준), debug용 `window.__surface` 의존,
`routes/**/transitions/` 관례.

#### 계획 조정 (2026-10-16)

- transition 이름: 파일 경로가 이름이며 세그먼트는 kebab-case만 허용한다(URL·`data-action`에 쓰이므로, 위반은 빌드 오류와
  힌트). 데모 transition은 `transitions/`의 평평한 이름(`switch-lang`·`action-demo`·`guide-load`…)으로 옮겼고, 새 데모는
  다중 세그먼트 `comments/add`를 쓴다. `routes/examples/chat/history.server.ts`는 transition과 페이지가 함께 쓰므로
  `shared/chatHistory.server.ts`로 옮겼다. 엔드포인트는 `/transition/<a>/<b>`·`/_surface/action/<a>/<b>`(세그먼트별 인코딩).
- `defineTransition`: `defineTransition({ input, targets, mode: 'queue', flash: { input }, viewTransition, handler })` 또는
  handler 함수 하나. 기본 export가 함수여도 된다. `defineManifest({ transitions })`는 이름 → 정의 객체다.
- 검증 실패 응답: `/transition`은 **422** JSON `{ frames: [error] }`(`kind: 'validation'`, `fieldErrors`, 오류 슬롯 렌더 포함),
  handler는 실행하지 않는다. 오류 프레임 `kind`에 `timeout`(전체·idle 타임아웃)도 더했다. 브라우저 `error.kind`는 DESIGN의
  다섯 종류에 `validation`·`network`(fetch 실패)를 더한 일곱 종류다. validation은 `reportError`로 보내지 않는다.
- PRG: handler에는 multipart의 `File`도 그대로 넘기고 flash에서만 제외한다. flash 쿠키는 `base64url(JSON).base64url(HMAC)`,
  HttpOnly·SameSite=Lax·Max-Age 60·https면 Secure다. `ctx.flash(name)`은 이름이 다르면 쿠키를 지우지 않는다. 오류 메시지는
  `TransitionError`이면 그대로, 그 밖은 production에서 `Transition failed`다.
- JS가 있을 때 가로채는 폼: `data-action` 폼과 `method="post"` 이면서 같은 origin의 `{BASE_PATH}/_surface/action/` 아래로
  보내는 폼(submitter `formaction`·`formmethod` 반영). 파일이 선택된 폼은 multipart로 보낸다(`data-params`는 문자열 필드).
  SSR은 그런 폼의 `action`/`formaction`도 액션 사용으로 보고 엔진을 싣는다.
- 타입: `.state-surface/actions.d.ts`는 전역 `StateSurface.Actions` 인터페이스(이름 → 스키마 입력 타입)를 확장한다. 결과는
  슬롯에 반영되므로 공통 `ActionResult`다. tsconfig는 점으로 시작하는 폴더를 디렉터리 include로 찾지 않아
  `.state-surface/*.d.ts`로 포함한다. 생성 파일이 없으면 이름은 `string`, params는 JSON 객체다.
- bootstrap `actions`: targets 또는 `mode: 'queue'`를 선언한 transition만 싣는다(나머지는 모든 슬롯과 겹침). `useAction`
  때문에 `data-action`이 없어도 엔진 페이지면 싣는다. 페이지 응답에 `X-Surface-Build`를 붙여 청크 실패 시 배포 교체를
  판정한다(HEAD 요청, 다르면 다음 `pointerdown`·`keydown`에 재로드).
- 휴면 슬롯: 단계 3의 "프레임이 오면 즉시 활성화"를 없앴다. 프레임은 최신 props로만 보관하고 예정 시점이나 조작으로
  활성화된다(DESIGN 5.3 ③). 청크 재시도는 실패한 promise를 공유 캐시에서 지우고 1초 뒤 다시 import한다.
- resetKey: Slot과 직접 지시자 아일랜드 모두 받는다. server·static 슬롯의 resetKey는 SSR 오류다. 아일랜드는 morph에서
  같은 componentId·같은 resetKey 값이면 인스턴스를 유지하고 새 props만 받는다(IC-06 확장, 그 밖은 교체).
- V-04: hydration 전 SSR 기본값과 다른 컨트롤 값·포커스·선택을 기록하고 복원한 뒤 `input`/`change`를 보낸다. Lithent는
  SSR에 없는 빈 텍스트 노드를 hydration 뒤 채우지 못한다(재현: 빈 문자열 → 갱신 무시). 데모는 `null`로 피했고 업스트림 보강
  후보로 남긴다(3장 외부 선행 작업과 같은 성격).
- 데모: actions 예제에 `actions:likes`(server 컴포넌트) + `useAction` 아일랜드(`like`, 입력 스키마·targets·queue)와
  `actions:comments`(JS 없는 폼, server 컴포넌트가 `ctx.flash`를 읽음)를 더했다. 저장소는 세션 쿠키별 메모리
  (`shared/actionsStore.server.ts`), 스키마는 손으로 쓴 Standard Schema 빌더(`shared/schema.ts`)다. `action-demo`는
  `page:header`를 더 이상 갱신하지 않고 targets를 선언해 like와 병렬로 실행된다. MPA 교차 문서 View Transition은
  reduced motion에서 끈다(인페이지 규칙과 같게). 가이드 본문의 `defineTransition('name', fn)` 예시는 단계 7에서 다시 쓴다.
- parity: 의미 비교의 허용 차이에 단계 5 actions 데모 섹션(`actions:likes`·`actions:comments`)을 더했다.

**검증 ID**: V-04, V-12, V-13, V-24.

---

### 단계 6: 라우터·persist·prefetch (DC-18, DC-19, DC-20, DC-06 이동, DC-13 공존)

서버 HTML 교체 방식의 선택형 클라이언트 라우터와 persist·prefetch, 서드파티 공존을 만든다. DESIGN 10.1~10.3·8.2·8.3.

**Entry**: 단계 5 Exit.
**Exit**: 라우터 이동 결과가 문서 로드와 같고 100회 이동 후 자원이 누적되지 않으며 GTM식 fixture가 보존된다.

#### 작업

- [ ] runtime 수명 분리: 문서 수명(라우터·액션 위임·로더·플러그인 등록)과 페이지 수명(`mount(page)`·`dispose()`).
      `document` 리스너는 한 번만 등록한다.
- [ ] `<ClientRouter prefetch transition />`: 렌더한 페이지에서만 라우터 청크를 로드한다.
- [ ] 가로채기: 같은 origin·BASE_PATH `<a>`와 `method="get"` 폼. 제외: `data-action`·POST 폼, `target`·`download`·
      수정 키, 해시만 바뀌는 링크, `data-surface-reload`.
- [ ] 이동 파이프라인: `surface:before-preparation`(취소 가능) → `after-preparation` → `before-swap`(교체 함수 대체) →
      `after-swap` → `page-load`(문서 로드에서도 발생), payload `{ from, to, direction, trigger, signal }`, `navigate()`.
- [ ] 이동 시 이전 이동 fetch와 진행 중 transition abort(대상이 모두 persist인 액션만 유지, targets 생략 액션은 abort).
- [ ] fallback: 네트워크 실패·비 HTML·build ID 불일치·라우터 없는 페이지·다른 origin 리다이렉트는 문서 로드. 라우터
      레이아웃의 4xx·5xx HTML은 교체하고 URL 갱신.
- [ ] swap: head 마커 병합(title·meta 교체, stylesheet·modulepreload URL 기준 유지·추가, 새 CSS 로드 후 교체),
      body 마커 사이 교체, persist 연결 유지 이동(새 콘텐츠 삽입 → `moveBefore` → 이전 콘텐츠 제거), module script 1회·
      inline은 `data-surface-rerun`만, `__SURFACE__` 다시 읽기, 새 페이지의 `<Boot>`·지연 슬롯 실행.
- [ ] history·scroll(`scrollRestoration = 'manual'`, `history.state`)·hash·포커스(`<main>`)·title live region announce,
      BFCache 복귀 충돌 없음.
- [ ] 이동 전환(DC-06): 기본 루트 크로스페이드, `transition="none"`, reduced motion·미지원 시 즉시 교체.
- [ ] persist(DC-19): 이름 규칙·중복·이름 없는 직접 지시자 persist 빌드 오류, server 슬롯 persist 빌드 오류,
      componentId 불일치 dev 경고, 새 props 반영·`transition:persist-props`·resetKey, 플러그인 `update`.
- [ ] prefetch(DC-20): hover(65ms)·tap·viewport·load, 링크별 `data-prefetch`, 캐시 20개 LRU·TTL 30초·1회 사용·액션 완료 시
      전체 비움, `Sec-Purpose: prefetch`, Save-Data·2G 이하 tap만, 라우터 없는 페이지는 Speculation Rules prefetch(미지원
      `<link rel="prefetch">`), back/forward는 최신 HTML 재요청.
- [ ] 서드파티 공존(8.2·8.3): 마커 밖 노드 보존, `surface:page-load`와 옵션 `dataLayer.push({ event: 'surface.page_view' })`,
      `history.pushState`·`replaceState`·`fetch`를 호출 시점에 전역에서 조회.
- [ ] 플러그인 훅의 라우터 시점(교체 전 cleanup, persist 요소 `update`).
- [ ] 데모 레이아웃에 `<ClientRouter />`를 둔다. 정적 0바이트 측정은 라우터 없는 fixture 페이지로 한다(V-01).

#### Baseline 테스트

- [ ] e2e: 링크·GET 폼·뒤로/앞으로 이동 후 DOM·state·boot·action이 문서 로드와 같음.
- [ ] e2e: 100회 이동 후 리스너·Lithent 인스턴스·옵저버·플러그인 수 불변, heap 수렴.
- [ ] e2e: persist iframe·video·입력 포커스·선택 범위 유지(iframe 재로드 없음), 짝 없는 요소 cleanup.
      단계 0 Chromium spike에서 선택 범위 초기화를 확인했으므로 명시적 snapshot/복원을 포함한다.
- [ ] e2e: GTM식 fixture(head·body 동적 script·iframe 주입) 20회 이동 후 노드 보존, page_view 20회, CSP 위반 0.
- [ ] 단위: 전역 API 캐시 금지(나중에 래핑한 `fetch`·`history`가 호출됨).

**검증 ID**: V-19, V-20, V-21, V-22, V-30.

---

### 단계 7: 콘텐츠·이미지·prerender (DC-24, DC-25, DC-26, DC-32)

prerender와 하이브리드 출력, 언어 경로 i18n, 콘텐츠 컬렉션, 이미지 최적화를 만들고 `shared/content.ts`를 옮긴다.
DESIGN 10.7~10.9.

**Entry**: 단계 5 Exit(단계 6과 병렬 가능).
**Exit**: 가이드·홈 등 콘텐츠 페이지가 컬렉션과 prerender로 동작하고 `shared/content.ts`가 없으며 prerender HTML에
미들웨어 헤더가 적용된다.

#### prerender (DC-24, DC-32)

- [ ] `export const prerender`, `surface({ prerender: true })` 반전, 동적 라우트 `getStaticPaths()` 필수(없으면 빌드 오류),
      목록 밖 params는 404.
- [ ] 제한 ctx: `cookies`·`request` 헤더·`locals`·`flash`·`nonce` 접근은 원본 위치와 함께 빌드 오류.
- [ ] 출력 `dist/client/<path>/index.html`, BASE_PATH 빌드 고정·시작 시 불일치 진단.
- [ ] 서빙(DC-32): prerender HTML도 코어 통과 → `onRequest` 실행(`ctx.route.prerendered`) → 어댑터 `readStatic` 본문,
      빌드 해시 ETag·304, `Cache-Control: public, max-age=0, must-revalidate`. JS·CSS·이미지는 어댑터 우선.
- [ ] 어댑터별 `readStatic`(Node·Bun·Deno 파일, Workers `ASSETS` 바인딩)과 Workers HTML 경로 `run_worker_first`.
- [ ] 서버 없는 정적 호스팅 가이드(`_headers` 등)와 그때의 한계(인증·요청별 처리 없음).

#### i18n (DC-24)

- [ ] `routes/[lang]/…` 경로, 언어별 prerender, `hreflang` 대체 링크, 언어 없는 경로는 `lang` 쿠키 → `Accept-Language` →
      기본 언어 순 302, 정적 호스팅은 기본 언어 prerender + canonical.
- [ ] 언어 전환은 같은 페이지의 다른 언어 경로로 이동하고 쿠키에 기록한다. `switch-lang` transition과 쿠키 기반 SSR
      언어 선택을 제거한다. 동등성 e2e의 언어 전환 시나리오를 경로 기준으로 갱신한다.

#### 콘텐츠 컬렉션 (DC-25)

- [ ] `content/config.ts`의 `defineCollection({ schema, loader, i18n })`, loader(`.md`·`.mdx`·`.json`·`.yaml`),
      `getCollection`·`getEntry`, 스키마 기반 타입 추론, `Content` 컴포넌트와 heading 목록.
- [ ] `.md` + `remark-directive` 블록 10종(paragraph·bullets·code·checklist·warning·sequence·diagram·callout·analogy·
      debug), 알 수 없는 디렉티브·속성 빌드 오류, rich 렌더러(단계 4) 공유, raw HTML 차단.
- [ ] `.mdx`(`@mdx-js/rollup`, `jsxImportSource: 'lithent'`), 블록 렌더러를 MDX 컴포넌트로 노출, 지시자 분석·서버 전용
      검사 적용.
- [ ] i18n parity: `.md`는 섹션 ID·블록 수·블록 타입, `.mdx`는 heading 구조. 빌드 오류·dev 경고.
- [ ] 진단(파일·필드·줄)과 dev 콘텐츠 변경 시 페이지 재로드.
- [ ] 코드 하이라이트를 서버 렌더로 옮기고(DESIGN 5.1 서버 우선) Prism 클라이언트 플러그인 필요 여부를 확정한다.

#### 이행

- [ ] `shared/content.ts`의 가이드를 `content/guides/<lang>/*.md`로, 홈·예제 UI 문구를 `content/pages/<lang>/*.yaml`로
      옮기고 제거한다. 기존 `shared/guideContent.test.ts` parity 테스트를 프레임워크 parity 검사로 대체한다.
- [ ] 가이드 본문을 2.0 API(페이지·Slot·transition·action, 모드와 지시자)로 다시 쓴다. ko·en 함께.
- [ ] 가이드 페이지의 로딩 SSR + `<Boot transition="guide-load">`를 prerender 정적 페이지로 바꾸고 `guide-load`
      transition을 제거한다.

#### 이미지 (DC-26)

- [ ] `<Image>`(WebP 단일 `<img>`)·`<Picture formats>`·`getImage()`, `alt` 필수, 원본 크기 `width`·`height`, 기본 lazy·async,
      `priority`(eager·`fetchpriority="high"`·preload), `layout` 3종 srcset·sizes·기본 CSS, 기본 폭 목록.
- [ ] `sharp` 빌드 변환·해시 파일명, dev 요청 시 변환과 `node_modules/.state-surface/images` 캐시.
- [ ] 원격: `remotePatterns`만 변환(미등록은 빌드 오류), Node·Bun·Deno SSR `/_surface/image`(허용 도메인·폭만, 디스크
      캐시), Workers는 원본 URL·`width`·`height` 필수·선택적 Cloudflare Images 위임.

#### Baseline 테스트

- [ ] prerender 결과와 같은 경로 SSR 결과의 HTML 일치(요청 의존 부분 제외).
- [ ] prerender HTML 응답에 미들웨어 헤더·조기 응답 적용, 본문 불변, ETag·304(적합성 스위트에 추가, 5개 어댑터).
- [ ] 콘텐츠 스키마·디렉티브 위반 진단 위치, parity 위반 빌드 오류, rich 렌더 악성 입력 차단.
- [ ] 이미지 출력 속성·srcset·priority, 원격 미등록 오류, 대표 페이지 CLS ≤ 0.1.

#### 제거 확인

`shared/content.ts`, `switch-lang` transition, 쿠키 기반 SSR 언어 선택, `guide-load` transition, `shared/guideContent.test.ts`.

**검증 ID**: V-26, V-27.

---

### 단계 8: 빌드 플러그인·진단 완성·패키징 (DC-16, DC-23, DC-28 ③)

진단 3채널과 소스맵, CSS Modules, 컴파일 배포, scaffold를 완성한다. DESIGN 3.1·10.6·11.3.

**Entry**: 단계 6·7 Exit. IC-05 결정.
**Exit**: 진단 fixture 전부가 원본 위치와 함께 보고되고, 생성한 scaffold 앱이 CI에서 설치·빌드·테스트를 통과한다.

#### 작업

- [ ] 타입 진단: `<Slot>` 속성·지시자 값·`SurfaceContext`·`definePlugin`·페이지 시그니처·`defineServerComponent`·`<Boot>`
      타입 선언 완성.
- [ ] Vite 플러그인 진단 완성(3.1 목록): `[state-surface]` 접두어, 원본 `파일:줄:열`, 코드 프레임, 해결 힌트. dev는 오류
      오버레이, build는 실패.
- [ ] `state-surface check` CLI: `tsc --noEmit` + 플러그인 분석(번들 생성 없음).
- [ ] 런타임 진단(dev): 프레임 위반·알 수 없는 슬롯·플러그인 DOM 소유권 위반 경고, devOverlay(`?debug=1`) 갱신,
      production trace 훅.
- [ ] 소스맵: dev·build 원본 TSX, production `hidden` 소스맵 옵션과 업로드 가이드(8.3-6).
- [ ] CSS Modules(DC-23): `*.module.css`, `@apply`·`@reference` 가이드와 scaffold 예시, 아일랜드 모듈 CSS는 청크 CSS로
      활성화 전 로드, static·server는 페이지 CSS로 head 출력, 라우터 head 병합 연동, 서버·클라이언트 클래스 해시 일치.
- [ ] 패키징(DC-28 ③, IC-05): 컴파일된 ESM JS + `.d.ts` + source map을 `exports`로 배포, `files` 갱신. 저장소 내부 개발은
      tsconfig·Vite alias로 원본 참조 유지.
- [ ] scaffold(DC-16): `create-state-surface` 최소 스타터(페이지 1개에 static·server 슬롯·client 아일랜드, transition 1개),
      `--template demo`(쇼케이스), 어댑터 프롬프트(기본 Node). 템플릿 원본을 저장소에 두고 `scripts/build-scaffold.mjs`의
      복사·overrides 방식을 대체한다. CI에서 생성·설치·빌드·테스트.
- [ ] `pnpm format`·`format:check` 대상에 `.tsx` 페이지·`content/`·새 디렉터리를 포함한다.

#### Baseline 테스트

- [ ] 진단 fixture 전 규칙(Slot 자식, children, 계산된 아일랜드, Slot-in-Slot, 이름 형식·중복, 서버 전용 유출, 라우트
      충돌, 지시자 조합, `defineServerComponent`·`<Boot>` 위치, persist 규칙)의 메시지 스냅샷.
- [ ] dev와 production 빌드에서 같은 적합성 스위트 결과(DC-16 dev/prod 동일성).
- [ ] CSS Modules: SSR·server 교체·client 렌더 클래스 일치, 이동 시 필요한 CSS만 로드.
- [ ] 생성 scaffold(최소·demo × Node 어댑터)의 설치·빌드·테스트.

#### 제거 확인

`scripts/build-scaffold.mjs`의 데모 복사 방식, 원본 `engine/**/*.ts` 배포 설정.

**검증 ID**: V-05, V-11, V-16, V-18(scaffold 부분), V-25.

---

### 단계 9: Test Hardening

확정된 계약과 한도를 이상 입력·경쟁·자원 관점에서 공격적으로 검증하고 발견한 결함을 고친다.

**Entry**: 단계 8 Exit.
**Exit**: 아래 스위트가 통과하고 발견한 결함마다 회귀 테스트가 있다.

#### 작업

- [ ] 프레임 퍼즈: 무작위 순서·누락 delta·중복·깨진 JSON·EOF·한도 경계·잘못된 op 조합을 서버 validator와 브라우저
      런타임에 각각 넣어 잘못 적용되지 않음을 확인.
- [ ] 악성 입력 모음: 속성 breakout, `javascript:`·`data:` URL, 이벤트 속성, rich AST 우회, `cssVars` 주입, `</script>`·
      U+2028, `_redirect` 우회(`//`·`/\`·스킴·인코딩), flash 변조·재사용, 지연 슬롯 토큰 변조·다른 빌드 재사용.
- [ ] 경쟁: 지연 로드 vs 프레임, 동시 액션(targets 겹침·생략·queue), 취소 타이밍, 이동 중 스트림, persist 중 액션,
      지연 슬롯 vs transition, 409 재로드 중 조작.
- [ ] 자원: 라우터 100회 이동, 장시간 스트림 메모리, 옵저버·플러그인 cleanup.
- [ ] 병렬 SSR 부하: 동시 요청에서 요청 간 데이터 유출 0.
- [ ] 한도·타임아웃 경계값(80% 경고, 초과 시 종료)과 Workers 요청 시간 한도 문서화 검증.

**검증 ID**: V-08, V-10, V-13, V-20(hardening 판정).

---

### 단계 10: Integration Test

production 빌드를 모든 어댑터·조건에서 끝까지 검증하고 성능 게이트와 수동 체크리스트로 릴리스를 판정한다.

**Entry**: 단계 9 Exit. IC-10 결정. [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md) 최신화(각 MT의 선행 실행 결과 반영).
**Exit**: 아래 검증 ID가 모두 통과하고 MANUAL_TEST_CHECKLIST 전 항목이 판정·기록됐다.

#### 작업

- [ ] production 빌드 × 5개 어댑터에서 적합성 스위트와 데모 동등성 e2e, BASE_PATH(`/demo`), 생성 scaffold 앱 E2E.
- [ ] 성능 게이트 활성화(DC-17): 홈·가이드 엔진 초기 JS gzip 기준선 대비 70% 이상 감소, 라우터·액션·boot·플러그인 없는
      static 페이지 엔진 JS 0, 대표 페이지 CLS ≤ 0.1, 라우터 100회 이동 누수 없음. 보고 지표(INP·첫 액션·라우터 이동·
      Workers 콜드 스타트·서버 번들·로더·라우터 크기)를 기록한다.
- [ ] View Transition(V-14): 문서 로드·라우터 이동·인페이지, 미지원 브라우저, reduced motion, 뒤로/앞으로·BFCache.
- [ ] 외부 SDK(V-31): 실제 GTM·Sentry(npm·Loader)·Datadog RUM(npm·CDN) 기본 설치로 문서 로드와 이동 20회, 오류 수집·
      page_view/view 수·트레이스 헤더·서버 오류 훅·노드 보존·CSP 위반 0(IC-10).
- [ ] MANUAL_TEST_CHECKLIST MT-01~MT-18 전 항목 실행·기록과 4장 릴리스 판정. 각 단계 종료 시 해당 MT의 선행 실행 결과도
      그 문서 5장에 기록한다.
- [ ] 문서 정본 갱신: README, CLAUDE.md(아키텍처·폴더 구조·명령), PROTOCOL.md, 공개 guide, scaffold README, 릴리스 노트.

**검증 ID**: V-14, V-17, V-18, V-19, V-26, V-29, V-30, V-31(릴리스 판정).

---

## 5. 검증 ID와 단계

구현 단계는 테스트를 처음 만드는 단계, 판정 단계는 DESIGN 14장 기준으로 그 ID를 마지막으로 통과시켜야 하는 단계다.
모든 테스트는 이후 단계에서도 계속 실행하며 단계 10에서 전체 회귀로 다시 확인한다.

| ID   | 구현 단계        | 판정 단계 |
| ---- | ---------------- | --------- |
| V-01 | 3                | 3         |
| V-02 | 4                | 4         |
| V-03 | 2·3              | 3         |
| V-04 | 5                | 5         |
| V-05 | 3                | 8         |
| V-06 | 3                | 3         |
| V-07 | 4                | 4         |
| V-08 | 4                | 9         |
| V-09 | 4                | 4         |
| V-10 | 2·4              | 9         |
| V-11 | 2                | 8         |
| V-12 | 5                | 5         |
| V-13 | 5                | 9         |
| V-14 | 4·6              | 10        |
| V-15 | 2                | 2         |
| V-16 | 8                | 8         |
| V-17 | 0(기준선)        | 10        |
| V-18 | 0~8              | 10        |
| V-19 | 6                | 10        |
| V-20 | 6                | 9         |
| V-21 | 6                | 6         |
| V-22 | 6                | 6         |
| V-23 | 4                | 4         |
| V-24 | 5                | 5         |
| V-25 | 8                | 8         |
| V-26 | 7                | 10        |
| V-27 | 7                | 7         |
| V-28 | 1(단계마다 확장) | 10        |
| V-29 | 1                | 10        |
| V-30 | 6                | 10        |
| V-31 | 1·4·6            | 10        |

## 6. 진행 상태 및 Handoff

### 실행 기록

| 단계 | 날짜       | 커밋                                     | `pnpm test`(파일/개수) | 측정·판정                                                                                                                                                      | 비고                                                                       |
| ---- | ---------- | ---------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 0    | 2026-10-15 | 측정 `94e4046`, 접두사 수정 `3b556e5`    | 34 / 458 통과          | 루트 E2E 9 + spike 4, `/demo` E2E 9 통과; 초기 JS gzip 28,147 B, 5회×2 측정                                                                                    | [측정 결과](../../perf/baseline-summary.md), [spike](../../perf/spikes.md) |
| 1    | 2026-10-15 | 단계 종료 커밋(Git 기록), 기준 `611b37e` | 35 / 459 통과          | 5 runtime × 8 적합성, SSR 9 + stream 2 정확 비교, 루트 E2E 9 + spike 4 및 /demo 9                                                                              | IC-07 결정; portable core/type guard 통과                                  |
| 2    | 2026-10-16 | `7f59296`, 기준 `c82b92c`                | 35 / 480 통과          | 단계 1 의미 비교 SSR 20(en·ko) + stream 3, 5 runtime × 8 적합성, 루트 E2E 9 + spike 5 및 /demo 9                                                               | IC-01~04 결정; 전체 tsc 40 → 5(기존 테스트 타입)                           |
| 3    | 2026-10-16 | `5c8f024`, 기준 `5a659cd`                | 37 / 498 통과          | modes E2E 4(엔진 JS 0·Lithent 배제·visible 지연·플러그인) + sentinel·경로 체인, 의미 비교 20 + stream 3, 5 runtime × 9 적합성, 루트 E2E 9 + spike 5 및 /demo 9 | 홈 초기 JS gzip 16,807 B(단계 0 28,147 B), 로더 4,818 B                    |
| 4    | 2026-10-16 | `4e184bf`, 기준 `07bb893`                | 36 / 567 통과          | 5 runtime × 11 적합성(지연 슬롯·pageId·409 추가), 의미 비교 20 + stream 3(슬롯 단위 op 형태), 루트 E2E 9 + spike 5 및 /demo 9, modes E2E 4, 전체 tsc 0         | 홈 초기 JS gzip 10,448 B(단계 0 28,147 B), 런타임 6,018 B, morph 3,525 B   |
| 5    | 2026-10-16 | 단계 종료 커밋(Git 기록), 기준 `8c83aa8` | 39 / 610 통과          | 5 runtime × 12 적합성(폼 본문·422·PRG·flash 추가), 의미 비교 20 + stream 3, 루트 E2E 11 + spike 5 및 /demo 11, modes E2E 5(V-04), 전체 tsc 0                   | 홈 초기 JS gzip 12,519 B, 로더 5,505 B, 런타임 6,858 B, core 90,821 B      |

### 단계 0 실행 상세

- Node 24.19.0, pnpm 10.13.1, Chromium 141.0.7390.37(Playwright 1.56.1). frozen install·전체 Vitest·format:check·전체 build 성공.
- 클라이언트 JS 98,515 B / gzip(level 9, Node zlib) 28,147 B, CSS 37,415 B / gzip 7,700 B,
  서버 번들 321,665 B / gzip 75,109 B. Vite 표시는 기본 압축 조건이 달라 JS gzip 약 28.21 kB다.
- `perf/baseline.json`·`perf/repeat.json`: 네 페이지 각 5회, CPU 4x/Fast 4G/캐시 off/identity 전송.
  첫 액션 중앙값 1차/2차(ms): 홈 155.8/143.9, 가이드 303.9/314.7, 검색 102.2/97.8, 채팅 118.9/115.5.
  편차 -7.6%~+3.6%, 모든 전송 크기 중앙값 동일. CLS 중앙값은 모두 0. 짧은 랩 INP는 field p75 판정이 아니다.
- SSR 수치는 순수 렌더 시간 대신 loopback 전체 HTML 수신 시간임을 명시했다. 파일별 JS·HTML·CSS·boot JSON,
  문서 로드·문서 이동 원시값과 조건을 보존했다. 2.0 청크 분할 전에는 공통 JS를 엔진·앱·플러그인별로 분리 계측할 수 없다.
- 브라우저 parity 9개: 언어/쿠키, guide boot·Prism·목차, 검색, 버튼·폼·scoped pending, 스트리밍·removed·error,
  UI 패치·clear, view-transition 갤러리, 채팅 스트리밍·abort·스크롤, 모바일 목차. 루트와 `/demo`에서 전부 통과.
- `/demo` 실브라우저에서 기존 production 정적 파일 404를 발견했다. `startProd` 정적 마운트에도 basePath를 적용했다(`3b556e5`).
  테스트 모드의 기존 basePath 통합 테스트는 정적 파일을 서빙하지 않아 놓친 결함이다. 새 E2E는 JS·CSS HTTP 오류도 검사한다.
  루트 성능 기준선은 이 접두사 수정 전 측정이며 루트 렌더·JS·CSS는 동일하다. scaffold 재생성 결과 추적 파일 변화 없음.
- spike 4개는 관측 결과를 검증한다. IC-01 문법 체인 통과(최종 결정은 단계 2), hydration 입력 덮어쓰기와
  `moveBefore` 선택 범위 초기화를 재현했고 DESIGN 및 단계 5·6의 필수 보완으로 연결했다. idiomorph 경계 제외 통과.
  이는 V-04/V-21 통과가 아니다. Chrome 133+/Firefox 144+/Safari 미지원은 MDN BCD 자료이며 브라우저 실측은 Chromium뿐이다.
- CI: 루트·`/demo` parity 필수 job과 루트 spike, 성능 보고 전용 job·실패 산출물 업로드를 추가했다.
  현재 실행 증거는 로컬 클라우드 머신이며 GitHub Actions 실행 결과·다른 머신 복원 검증은 아직 없다.
- 초기 하네스 실패(기본 브라우저 캐시 경로 누락, UI clear 기대값, 안정화 click 때문에 채팅 응답이 끝난 뒤 취소 시도)는
  원인 확인 후 각각 cache export·실제 clear 계약·Enter submit으로 수정해 재검증했다. 활성화·persist 제약은 해결했다고 표시하지 않는다.

### 단계 1 실행 상세 (2026-10-15)

- `createHandler({manifest,...}).fetch(Request,platform)`·SurfaceContext·sequence 미들웨어·쿠키·nonce·env·body 한도·CSRF·stream abort/timeout·onError를 구현했다.
  `createApp`, Express req 기반 API, TransitionHooks, hooks.ts, SSR hash를 제거했다. 기본 Node HTTP와 optional Express peer로 분리했다.
- `engine/vite.ts`가 build/dev 공통 정적 registry와 asset 설정을 생성한다. 실행 중 readdir/readFileSync 탐색은 없다.
  core source + 독립 edge bundle 검사와 `pnpm typecheck:server`가 통과한다. 빌드용 탐색은 `engine/build/`, 정적 파일 async 읽기는 어댑터에만 있다.
- Node 24.19.0·Express 5.2.1·Bun 1.3.0·Deno 2.5.4·Wrangler 4.151.0/workerd에서 같은 fixture·8개 시나리오씩 40개 통과.
  SSR·env·cookie·nonce·동적 params·HEAD·404·BASE_PATH·미들웨어·점진 NDJSON·첫 프레임 쿠키·CSRF·본문 한도·오류 masking·취소/finally·정적 자산 MIME/cache/경계 포함.
- Worker idle 취소 실패는 구/신 Wrangler와 최소 workerd probe에서 진단했다. native TransformStream writer의 idle 빈 줄 heartbeat(250ms)와 waitUntil cleanup으로 해결했다.
  기존 decoder의 빈 줄 무시 계약을 유지한다. 취소 시나리오는 전용 소켓을 첫 state 프레임 직후 끊고, timeout(1s) 전 generator finally가 실행되는지 검사한다.
  `enable_request_signal` 플래그가 필요하며 코드·설정·문서에 기록했다. 판정 assertion을 끄거나 skip하지 않았다.
- 단위/통합 테스트: 35개 파일/459개 통과. 종전 hash 전용 6개를 제거하고 context 4개·stream cleanup/cookie 2개·template 오류 reporting 1개를 추가했다.
  기존 hook 검증은 ctx/middleware 검증으로 바꿨다. 등록·렌더·라우팅의 기존 테스트는 새 코어를 경유한다.
- Express 변경 전 저장한 SSR 9페이지·transition 2개를 정확히 비교했다(정규화는 hash 속성만 제거). 전부 동일하다.
  생산 예외 상세는 onError로 보고하고 클라이언트에는 가리며, 의도적으로 yield한 error 프레임은 그대로 유지한다.
- production 루트 parity 9 + spike 4, `/demo` parity 9 통과. dev SSR·언어 전환·cookie 동작 통과.
  5개 어댑터의 실제 데모 앱도 virtual entry로 빌드했다. 기본 산출물은 빈 BASE_PATH Node 앱으로 복원했다.
- 테스트용 앱 helper를 프로젝트 `testing/`로 옮기고 scaffold 원본·Vite/Vitest overrides·Node 엔트리·타입 선언·명령을 같은 단계에서 갱신했다.
  생성물은 `pnpm build`에서 재생성했다. 독립 배포 패키지의 컴파일·새 scaffold 설치 행렬 최종 판정은 예정대로 단계 8이다.
- GitHub Actions에 5-runtime matrix와 core/type guard·legacy parity·adapter app build를 추가했다. 현재 증거는 클라우드 로컬 실행이며 원격 CI 실행 완료를 주장하지 않는다.
- 전체 `tsc --noEmit`은 기존 client/template 타입 문제로 실패한다. `611b37e` archive에서도 47개 오류가 재현됐다.
  이번 변경의 서버 그래프는 별도 strict typecheck로 검증했다. 남은 전체 오류는 baseline과 정규화 비교하고 신규 오류는 남기지 않았다.
  이는 build·Vitest의 실패가 아니며 단계 8 타입 진단 완성 때 추적한다.
- 문서·제거 검색·format:check·전체 build·frozen install을 검증했다. [서버 가이드](../server-adapters.md), PROTOCOL, README, AGENTS 및 4개 정본 문서를 갱신했다.

### 단계 2 Entry 실행 상세 (2026-10-16)

- npm 최신 Lithent 1.25.1 배포의 SSR 소스에서 `escapeAttr` 보강을 확인하고 의존 범위·lockfile·scaffold 원본을 갱신했다. 업스트림 패키지 무결성 검증을 유지했다.
- `ssrRenderer.test.ts`에 JSON 속성·속성 탈출 payload·boolean/style/innerHTML 회귀 3개를 추가했다. 전체 35개 파일/462개 테스트, build·서버 타입 검사·format 검사 통과.
- Chromium에서 JSON 및 악성 title 속성의 원문 왕복·추가 속성/스크립트 부재를 검증했다. 기존 데모 루트 9개·`/demo` 9개와 spike 5개 통과. IC-01(namespaced 표기 유지)·IC-02(^1.25.1)를 결정했다.
- happy-dom 20.5.0은 단순 `title="&lt;&gt;"`도 원문으로 복원하지 않는다. 이 모델의 결함을 피하기 위해 완전한 파서 왕복은 실제 Chromium에서 검사하며 기대값을 약화하지 않았다.
- Lithent 패키지 CommonJS 진입점 변경에 맞춰 브라우저 probe는 `.cjs`·`.umd.js` 모두에서 ESM 파일을 찾는다. 수정 후 spike 전부 통과. hydration 입력·선택 범위 초기화는 여전히 재현된다(V-04 미충족).
- 이 기록은 단계 2 Entry 완료다. Page/Slot 및 데모 전환 체크박스는 아직 완료하지 않았다. 단계 1의 정확한 문자열 기준선은 역사 기록으로 보존하며, 속성 이스케이프는 의도된 보안 변경이다.

### 단계 2 실행 상세 (2026-10-16)

- 공개 API: `state-surface`의 `Slot`·`Boot`와 JSX 전역 타입(`client:*` 지시자, `key`, Promise 반환 컴포넌트를 거부하는
  `JSX.ElementType`), `state-surface/server`의 `defineServerComponent`·`PageModule`·`PageFunction`. `defineTemplate`·
  `RouteModule`·`BootConfig`를 제거했다. 빈 슬롯은 `<Slot name component={X} />`, 호스트 속성은 `class`·`style`·`id`·`data-*`·
  `aria-*`로 정했다(DESIGN 2.1 보완).
- 빌드: `engine/build/analyze.ts`(oxc 분석), `transform.ts`(MagicString 호출 지점 변환·소스맵), `app.ts`(페이지 import 그래프,
  componentId, 모듈 간 진단), `routeScanner.ts`(`routes/**/*.tsx`, `_` 제외, URL 충돌), `diagnostics.ts`(`파일:줄:열`·코드 프레임).
  `engine/vite.ts`는 `enforce: 'pre'`로 바뀌고 manifest와 `virtual:state-surface/islands`(eager 23개)를 같은 분석으로 만든다.
  dev는 분석 대상 파일 변경 시 가상 모듈을 무효화하고 전체 재로드한다. `oxc-parser`·`magic-string`을 런타임 의존성으로 옮겼다.
- 렌더: `engine/server/ssrRenderer.ts`가 페이지 await → 페이지 트리 슬롯 수집(이름 중복·server 컴포넌트 위치 검사) →
  server `load` 동시 시작·`Promise.all` → 마커 투영(트리를 변경하지 않고 바뀐 경로만 복사해 모듈 전역 JSX 공유에도 안전) →
  무작위 토큰 자리표시 치환·doctype 순으로 문서를 만든다. 관리 태그는 CSS → bootstrap JSON → 엔진 엔트리(nonce) 순이다.
  Promise를 반환한 컴포넌트, html/head/body 개수, client 트리·정적 조각 안의 Slot·아일랜드·`<Boot>`를 SSR 오류로 진단한다.
  `routeHandler.ts`·`initialStates.ts`·`fillHState`·`templateRegistry`·`templateCheck`·`auto.ts`를 제거했다.
- 클라이언트: `lithentBridge`가 `data-component`로 registry에서 컴포넌트를 찾고, `islands.ts`가 `<h-island>`를 hydrate(`client:only`는
  render)한다. `__BOOT__` 배열을 문서 순서로 실행한다.
- 데모: 9개 페이지를 `.tsx`로, `layouts/surface.ts`를 `layouts/Layout.tsx`로, `templates/`를 `_components/`(공통은
  `_shared/components/`)로 옮겼다. 초기에 비어 있던 `search:results`·`chat:current`·`chat:typing`·`system:error`는
  `component` 빈 슬롯이다. 가이드는 로딩 SSR + `<Boot transition="guide-load">`다. scaffold를 재생성했다.
- 검증: Vitest 35개 파일/480개, format:check, build, typecheck:server 통과. 전체 `tsc --noEmit` 오류는 40 → 5개이며 남은 5개는
  기존 `abort.test.ts`·`actionDelegation.test.ts` 타입 문제다(단계 8). 단계 1 production 산출물 의미 비교 20개 문서(en·ko 각 10
  페이지, 404 제외)와 transition 3개 통과(비교 도구 자체는 텍스트·JSON·속성 변경을 잡는지 변형 입력으로 확인).
  Chromium E2E 루트 9 + spike 5, `BASE_PATH=/demo` 9 통과, dev 서버 브라우저 확인(가이드 boot·검색 빈 슬롯 채움, 콘솔 오류 0).
  Node 22.22.0·Express 5.2.1·Bun 1.4.2·Deno 2.5.4·Wrangler 4.151.0/workerd 적합성 각 8개(총 40) 통과, 5개 어댑터 앱 빌드 통과.
  portable core 번들 48,413 B(단계 1 38,498 B, 페이지 렌더러 포함), Node/Express/env/runtime 스캔 import 없음.
- 크기: client JS 97,632 B / gzip(level 9) 28,474 B(단계 0 28,147 B), CSS 37,415 B / gzip 7,700 B, 서버 번들 337,923 B /
  gzip 81,466 B. 감소 목표는 단계 3 이후의 청크 분리·모드 정규화로 판정한다.
- 이번 실행은 클라우드 로컬 머신 결과다. GitHub Actions 결과, Bun 1.3.0 고정 버전(이 머신은 1.4.2), 수동·실기기 검증은 관측하지 않았다.

### 단계 3 실행 상세 (2026-10-16)

- 모드: `<Slot>`은 명시 `mode`, 없으면 client 지시자 유무로 client/static을 정한다. static·server는 SSR만 하고
  `data-component`·상태를 보내지 않으며, 브라우저는 그 슬롯의 콘텐츠 프레임을 무시하고(UI 패치는 적용, trace `dropped`)
  내용을 유지한다(V-01). client 슬롯·아일랜드는 `data-activation`·`data-media`·`data-only`를 기록하고 `client:only`는 SSR을
  건너뛰고 fallback을 출력한다. capability 기본값은 `strict`(메타데이터만).
- 엔트리 선택: `renderPage`가 렌더된 client 컴포넌트(중복 제거·`client:load` 여부)·`data-action`·`<Boot>`·플러그인을 모아
  `PageUsage`를 만들고, handler가 빌드 manifest로 CSS(전역 + 렌더된 컴포넌트·플러그인 청크 CSS)·modulepreload(client:load 청크와
  정적 import, 액션 런타임)·앱 엔트리·엔진 로더를 고른다. 사용량이 없으면 엔진 script와 bootstrap JSON을 쓰지 않는다.
- 빌드: `virtual:state-surface/islands`·`virtual:state-surface/plugins`가 componentId/plugin id → `import()` 로더다
  (컴포넌트·플러그인마다 청크). `definePlugin` 리터럴 옵션과 `export const plugins`(페이지 + import한 모듈)를 분석해 route별
  plugins를 manifest에 넣는다. client 빌드에서 `state-surface/server-only`(browser 조건은 throw 모듈)·`*.server.*`·Node builtin이
  보이면 `routes/_components/Chart.tsx → lib/fmt.ts → server/db.server.ts` 형식으로 실패한다.
- 클라이언트: `loader.ts`(엔트리) → `start.ts`가 bootstrap을 읽고 `componentHost`(Lithent bridge·컴포넌트 청크 지연 로드,
  hydrate/render/update/unmount, 휴면 프레임 처리)·`pluginHost`(시점 로드, 늦은 attach, cleanup, onPage/onAction)를 시작하고,
  `data-action`·`<Boot>`·debug가 있으면 `runtime.ts`(StateSurface·delegation·boot·devOverlay)를 로드한다. StateSurface의 플러그인
  훅(`onMount`·`onTransitionStart/End`·`onInit`)을 제거하고 `onAction`·`isUpdatable`을 넣었다.
- 브라우저 검증에서 `display:contents`인 `<h-island>`가 IntersectionObserver에 교차를 알리지 않는 결함을 찾아 호스트와 자식
  요소를 함께 관찰하도록 고쳤다(scheduler 단위 테스트와 modes E2E로 회귀 고정).
- 검증: Vitest 37개 파일/498개, format:check, build, typecheck:server 통과. 전체 tsc 오류는 기존 5개 그대로. `pnpm test:modes`:
  fixture 빌드, V-05 sentinel 2종(파일명·마커)이 client 산출물 전체에 없음, 실패 fixture 경로 체인 2개, Chromium 4개(static 페이지
  JS 요청은 앱 엔트리 1개뿐·액션 전용 페이지에 Lithent 요청 없음과 static 내용 유지·`client:visible` 청크는 스크롤 전 미요청·
  플러그인은 선언 페이지만). 단계 1 의미 비교 20개 문서 + transition 3개(허용 차이에 modulepreload·`__PLUGINS__` 추가), 루트 E2E 9 +
  spike 5, `/demo` 9, dev 서버 브라우저 확인. Node·Express·Bun 1.4.2·Deno 2.5.4·workerd 적합성 각 9개(static 페이지 시나리오 추가)와
  5개 어댑터 앱 빌드 통과. portable core 번들 52,123 B.
- 크기(gzip level 9, 파일별 합): 초기 JS 홈 16,807 B·가이드 18,878 B(Prism 플러그인 9 KB는 load 시점 별도)·검색 16,458 B·
  채팅 16,954 B. 단계 0의 단일 번들 28,147 B 대비 홈 약 40% 감소. 70% 게이트(단계 10)는 데모 슬롯의 server 모드 전환(단계 4)
  이후 판정한다. 공용 청크: 로더 4,818 B, 액션 런타임 3,313 B, Lithent 4,716 B, bridge 837 B.
- 이번 실행은 클라우드 로컬 머신 결과다. GitHub Actions 결과와 Bun 1.3.0 고정 버전, 수동·실기기 검증은 관측하지 않았다.

### 단계 4 실행 상세 (2026-10-16)

- 두 층 계약: `shared/protocol.ts`에 작성 층(`StateFrame`, done·error yield 금지, UI 토큰·cssVars 검증)과 전송 층(`patch`·`done`·
  `error`, op `html`·`props`·`merge`·`remove`·`ui`)을 두고 브라우저용 가벼운 검사(`checkWireFrame`)를 둔다. 서버
  `projection.ts`가 요청 상태를 빈 값에서 시작해 `applyFrame`으로 줄이고 슬롯 모드별로 투영한다(server → `renderSlotHtml`, client →
  props·merge). targets(선언 또는 첫 full 프레임)·페이지·static 위반은 작성 오류다. server 렌더는 슬롯별 첫 갱신 즉시·이후 33ms 1회·
  종료 전 전부. `transitionResponse.ts`가 generator·async 결과를 wire 프레임으로 바꾸고 엔진이 `done`을 붙이며 idle 타임아웃·줄·
  총량 한도를 건다. dev는 80% 경고와 server 재렌더 경고를 낸다. `ctx.external(source)`는 `external` 슬롯과 Standard Schema만 통과시킨다.
- 빌드: analyzer가 Slot 리터럴 옵션(swap·capability·sandbox·viewTransition·server:defer·cache·external·schema)과 정규화된 mode를 읽고,
  app이 페이지별 슬롯 표를 만든다. 서버 manifest에 page manifest(`pageId` = 라우트 파일 경로), server 슬롯 컴포넌트 registry,
  buildId, 빌드 생성 루트 비밀을 넣는다.
- SSR: `__SURFACE__` 하나로 통합하고 호스트 속성을 없앴다. capability strict·rich는 슬롯 콘텐츠의 `innerHTML`을 오류로, URL 속성의
  비허용 scheme을 제거하고, rich는 `state-surface/rich`의 Markdown allowlist 렌더러, unsafe는 script를 inert `template`로 바꾸고
  `sandbox="iframe"`이면 `srcdoc`에 담는다. `server:defer`는 fallback과 AES-GCM 토큰(IC-09 HKDF)을 쓰고
  `/_surface/island/:componentId`(GET, 2KB 초과 POST)가 미들웨어를 거쳐 `load`·렌더 후 `{ html, islands }`를 준다.
- 브라우저: `stateSurface.ts`가 상태표(awaiting-baseline → active → completed·failed·aborted, 빈 성공, EOF 오류)·op 검사(콘텐츠 위반
  중단, ui 위반 skip)·슬롯별 coalesce·generation 무효화·opt-in View Transition(액션 헤더·`data-view-transition`·`<Slot viewTransition>`,
  요청당 1회, reduced motion 생략)·오류 슬롯·409 재로드·전역 `fetch` 호출 시점 조회·지연 슬롯(병렬, revision 폐기, 1초 후 1회
  재시도)을 맡는다. `slotDom.ts`는 replace(플러그인 cleanup → 아일랜드 dispose → innerHTML → `id` 기준 포커스·선택·스크롤 복원 →
  attach → 아일랜드 활성화)·morph(`morph.ts` 청크, IC-06)·remove·UI 패치를 맡는다. `sync()`의 전면 `startViewTransition`은 없앴다.
- 데모: 모든 슬롯을 server 모드로 옮기고(채팅 `chat:current`만 client), transition에서 `done`·`error` yield를 없앴다(오류는
  `TransitionError`). 홈·스트리밍 예제는 Lithent를 로드하지 않는다.
- 검증: Vitest 36개 파일/567개(새 projection·capability·slotDom·브라우저 상태표 테스트, 서버→브라우저 통합 4개, 악성 입력 세트:
  속성 탈출·`javascript:`/`data:` URL·Markdown raw HTML·cssVars), format:check, build, typecheck:server, 전체 tsc 오류 0(단계 3까지의
  기존 5개 포함 해소). `pnpm test:parity` 20개 문서(부트스트랩은 basePath·boot·렌더 슬롯 집합 비교) + transition 3개(프레임별 대상
  슬롯 비교), 루트 E2E 9(검색 morph 포커스·값 유지 추가) + spike 5, `/demo` 9, `pnpm test:modes` 4 + sentinel·경로 체인.
  Node·Express·Bun 1.4.2·Deno 2.5.4·workerd 적합성 각 11개(지연 슬롯 토큰·island 엔드포인트·캐시 헤더, pageId 400, 409, production
  오류 프레임·async 단건 server 슬롯 HTML 추가)와 5개 어댑터 앱 빌드 통과. portable core 번들 79,640 B. dev·production 서버에서
  Chromium으로 데모 9개 흐름 확인.
- 크기(gzip level 9, 실제 로드된 JS 합): 홈 10,448 B(로더 4,430 + 런타임 6,018)·가이드 19,995 B(Prism 9,119 포함)·검색 13,973 B
  (morph 3,525 포함)·채팅 16,640 B(Lithent 4,716·bridge 837·chatCurrent 371 포함)·스트리밍 10,448 B. 단계 0의 28,147 B 대비 홈 63% 감소.
  70% 게이트는 단계 10, 로더 2KB 목표는 단계 5에서 다시 본다.
- 이번 실행은 클라우드 로컬 머신 결과다. GitHub Actions 결과와 Bun 1.3.0 고정 버전, 수동·실기기 검증은 관측하지 않았다.

### 단계 5 실행 상세 (2026-10-16)

- 서버: transition을 루트 `transitions/**/*.ts`로 옮기고 경로를 이름으로 등록했다(`transitionScanner.ts`, 중복·kebab-case 위반은
  빌드 오류, `_` 파일·테스트·선언 제외). `defineTransition` 객체형과 Standard Schema 검증(`shared/schema.ts`, 필드 경로별 오류),
  form-urlencoded·multipart → 객체(같은 이름은 배열), 422 검증 오류 프레임, `timeout` 오류 종류, `reset: [slot]` → `props` op
  `reset: true`(server 슬롯은 작성 오류)를 넣었다. `/_surface/action/<name>`은 미들웨어·CSRF 검사 뒤 handler를 끝까지 실행하고
  (프레임 버림) 303으로 답한다. `_redirect` → 같은 origin `Referer` → BASE_PATH 루트 순으로 검증하고, 결과는 IC-09 flash 키로
  서명한 일회성 쿠키(3KB 한도, 입력값 → 필드 오류 순 축소)로 넘긴다. `ctx.flash(name)`·`actionUrl()`·`ParamsOf`·`Flash`를 공개했다.
- 빌드: Vite 플러그인이 `transitions/`를 감시하고 `.state-surface/actions.d.ts`(type import만, V-05)를 build 시작·dev 변경 시
  다시 쓴다. `useAction`·`<Boot>`·`actionUrl()`의 이름·params 타입 검사는 TypeScript 컴파일러로 실제 오류(`@ts-expect-error`)까지
  확인하는 테스트로 고정했다.
- 브라우저: `stateSurface.ts`가 요청을 동시에 관리한다(같은 이름·겹치는 targets abort, targets 생략은 전부와 겹침 + dev 경고 1회,
  `mode: 'queue'` 순차, `AbortSignal`). pending은 요청별 카운트로 `data-pending`(완료까지)·`data-has-result`(첫 결과 반영 후)를
  붙인다. `transition()`/`run()`은 throw 없이 `ActionResult`로 끝난다. `useAction`(`runtimeAccess.ts`로 런타임을 지연 로드,
  `window.__surface` 제거)·이벤트 규칙(bubble 단계, `preventDefault()` 존중, 이벤트당 1회, submitter·다중 값 snapshot, 파일은
  multipart, `actionUrl` 폼 가로채기)·`<Boot>` 경고를 넣었다. `componentHost.ts`는 휴면 경계의 `pointerdown`·`focusin`·`keydown`
  즉시 활성화, 청크 1초 뒤 1회 재시도·`onChunkError`, 휴면 최신 props 보관, reset·resetKey 재마운트, morph resetKey 유지를 맡고,
  `lithentBridge.ts`가 hydration 입력 보존(V-04)을 한다. 로더는 청크 최종 실패 시 `X-Surface-Build`를 비교해 다음 조작에 재로드한다.
- 실브라우저에서 찾은 결함 2건: ① Lithent hydration이 빈 텍스트 노드를 이후 갱신하지 못해 `useAction` 상태 문구가 바뀌지 않음
  (원인 재현 후 `null` 렌더로 해결, 가이드·계획 조정에 기록), ② V-04 픽스처가 상수 `value`를 렌더해 재렌더 때 값이 되돌아감
  (제어 입력 `value={text}`로 수정, 엔진 결함 아님). JS 끔 E2E는 MPA 교차 문서 View Transition이 다음 클릭을 가로채
  reduced motion에서 전환을 끄도록 CSS를 바꾸고 키보드 제출로 고정했다.
- 검증: Vitest 39개 파일/610개(새 `action.test.ts` PRG·flash·리다이렉트·크기·위조·422·multipart, `transitionScanner.test.ts` 스캔·
  타입 검사, 동시성 매트릭스·pending·결과 종류, `useAction`, 위임 이벤트 규칙·`actionUrl` 폼·multipart, 활성화·재시도·reset·resetKey·
  morph resetKey, V-04 단위, 로더 배포 교체 재로드), format:check, build, typecheck:server, 전체 tsc 0. `pnpm test:parity` 20개 문서 +
  transition 3개, 루트 E2E 11(JS 없는 PRG 303·flash 일회성·새로고침 재제출 없음, JS 스트림·like 병렬·검증 오류 표시 추가) + spike 5,
  `/demo` 11, `pnpm test:modes` 5(V-04: 청크를 붙잡은 채 입력·선택 → hydration 후 값·선택·포커스·컴포넌트 상태 유지). Node·Express·
  Bun 1.4.2·Deno 2.5.4·workerd 적합성 각 12개(폼 본문·422·multipart PRG·flash·리다이렉트 검증 추가)와 5개 어댑터 앱 빌드 통과.
  portable core 번들 90,821 B. production 서버에서 Chromium으로 actions 데모(JS 켬·끔, 병렬·queue·검증 오류) 확인.
- 크기(gzip level 9, 실제 로드된 JS 합): 홈 12,519 B(로더 5,505 + 런타임 6,858 + actionError 156)·가이드 22,067 B·검색 16,033 B·
  채팅 19,331 B·스트리밍 12,519 B·actions 19,737 B(Lithent 4,729·bridge 1,324·likeButton 973 포함). 단계 4 대비 홈 +2,071 B는
  조작 시 활성화·재시도·배포 확인·`actionUrl` 폼 처리(로더 +1,075 B)와 동시성·결과·pending 카운트(런타임 +840 B)다. 로더 2KB 목표
  (DC-04 ⑥)는 미달이며 단계 8 패키징에서 다시 측정한다.
- 이번 실행은 클라우드 로컬 머신 결과다. GitHub Actions 결과와 Bun 1.3.0 고정 버전, 수동·실기기 검증은 관측하지 않았다.

### 상태

- **완료**: 단계 0·1·2·3·4·5. IC-01~IC-04·IC-06~IC-09 결정.
- **다음**: 단계 6(라우터·persist·prefetch)과 단계 7(콘텐츠·이미지·prerender)은 병렬 진행 가능. IC-05·IC-10은 단계 8·10에서
  결정한다.
- **블로커**: 없음. persist 선택 범위 보존은 단계 6에서 반드시 보완한다. 데모 가이드 본문의 구 API 설명(`__UI__`·`__STATE__`·
  `defineTransition('name', fn)` 포함)과 prerender 액션 폼 빌드 경고는 단계 7에서 처리한다. Lithent 빈 텍스트 hydration은
  업스트림 보강 후보다.
- **기준 커밋**: 단계 0 `611b37e`, 그 이전 `94e4046`, 단계 1 `077f420`, 단계 2 Entry `c82b92c`, 단계 2 `7f59296`,
  단계 2 문서 `5a659cd`, 단계 3 `5c8f024`, 단계 4 Entry `07bb893`, 단계 4 `4e184bf`, 단계 4 문서 `16a2e7e`,
  단계 5 Entry `8c83aa8`.
