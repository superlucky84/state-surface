# TLS 리버스 프록시 뒤 Origin 설정 — 요구사항

작성일: 2026-11-12
상태: Todo — 개선사항 기록, 미구현

## 문서 위치와 범위

이 묶음은 `docs/todo/proxy-origin/`에 둔다(사용자 지정 위치 `docs/todo/`). 현재 동작의 계약은
[docs/server-adapters.md](../../server-adapters.md)(POST Origin 검사, 어댑터 진입점)를 따른다.

| 문서                                                   | 역할                                  |
| ------------------------------------------------------ | ------------------------------------- |
| [REQUIREMENTS.md](./REQUIREMENTS.md)                   | 배경, 요구사항, 제약, 비목표          |
| [DESIGN.md](./DESIGN.md)                               | 현재 동작, 변경 설계, 결정 체크리스트 |
| [IMPLEMENT.md](./IMPLEMENT.md)                         | 단계별 구현과 테스트 게이트, handoff  |
| [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md) | 배포 전후 수동 확인                   |

관련 코드 범위:

- `create-state-surface/templates/adapters/{node,express,bun,deno}/server.ts` — 서버 진입점 템플릿
- `create-state-surface/templates/base/env.example` — 생성 앱의 `.env.example`
- `create-state-surface/templates/{demo,minimal}/README.md`, `create-state-surface/README.md` — 배포 안내
- `create-state-surface/bin/create-state-surface.js` — `TEMPLATE_REF`(템플릿을 받는 고정 커밋)
- `engine/adapters/http.ts` — Node/Express 요청 URL의 origin 추론
- `engine/adapters/bun.ts`, `engine/adapters/deno.ts` — `serve()` 옵션
- `engine/server/core/handler.ts` — POST Origin 검사와 403 응답

## 배경 (2026-11-12 데모 서버 배포)

- 데모 서버(`state-surface.subtleflo.com`)는 nginx가 TLS를 종료하고 `http://127.0.0.1:7100`의 node 어댑터
  앱(pm2 cluster)으로 프록시한다. 앱은 `create-state-surface@0.2.0 --template demo --adapter node`로 생성했다.
- 배포 후 `/ko/examples/actions`의 모든 액션이 `POST /transition/action-demo 403 (Forbidden)`으로 실패했다.
- 원인: node 어댑터는 소켓이 평문이라 요청 URL을 `http://<Host>`로 만든다(`engine/adapters/http.ts:16`).
  브라우저는 `Origin: https://state-surface.subtleflo.com`을 보내므로 `handler.ts`의 POST Origin 검사가
  `https://…` ≠ `http://…`로 판정해 `403 Cross-origin POST forbidden`을 응답했다. Origin 헤더 없는 curl
  확인은 통과해서 배포 직후 점검에서 놓쳤다.
- 조치(운영): 서버의 `server.ts`를 `serve({ ...handler, manifest, origin: process.env.ORIGIN })`로 고치고
  `ecosystem.config.cjs` env에 `ORIGIN: 'https://state-surface.subtleflo.com'`을 넣어 재빌드했다. 같은 Origin은
  200, 다른 Origin(`https://evil.example`)은 여전히 403임을 확인했다.
- 판단: 엔진의 Origin 검사는 의도대로 동작했다(CSRF 방어, 위조 가능한 `X-Forwarded-*`를 기본으로 믿지 않음).
  `docs/server-adapters.md`도 "TLS 종료 뒤에서는 어댑터에 신뢰할 public `origin`을 설정"하라고 적고 있다.
  다만 기본 템플릿이 이 설정을 노출하지 않고 403에 힌트가 없어, 흔한 배포 구성에서 사용자가 원인을 찾기 어렵다.
  즉 결함이 아니라 문서·DX 개선 과제다.

## 요구사항

상태: **확정**은 사용자가 결정한 것, **제안**은 결정 전(TBD)이다.

| ID      | 요구사항                                                                                                                                                                                                                             | 상태           | 검증                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---------------------- |
| RQ-PO-1 | node·express 템플릿 `server.ts`가 `origin: process.env.ORIGIN`을 어댑터에 넘긴다. `ORIGIN`이 없으면 지금과 같이 소켓·Host로 추론한다.                                                                                                | 확정 (DC-PO-1) | M-PO-1, M-PO-2, M-PO-5 |
| RQ-PO-2 | 생성 앱의 `.env.example`과 README가 `ORIGIN`(TLS 프록시 뒤의 public origin)을 안내한다.                                                                                                                                              | 확정 (DC-PO-1) | M-PO-1                 |
| RQ-PO-3 | 템플릿 변경이 사용자에게 닿도록 `TEMPLATE_REF`를 갱신하고 `create-state-surface`를 새 버전(0.2.1)으로 배포한다. RQ-PO-1·2만으로는 `state-surface` 패키지 재배포가 필요 없다(node·express 어댑터가 0.2.0에서 이미 `origin`을 받는다). | 확정           | M-PO-1                 |
| RQ-PO-4 | Bun·Deno `serve()`도 `origin` 옵션을 받고, 두 템플릿이 `ORIGIN`을 넘긴다. 엔진 변경이므로 `state-surface` 릴리스가 필요하다.                                                                                                         | 제안 (DC-PO-2) | M-PO-6                 |
| RQ-PO-5 | 프록시 설정 누락으로 보이는 403에서 운영자가 원인을 알 수 있는 힌트(로그)를 남긴다.                                                                                                                                                  | 제안 (DC-PO-3) | M-PO-3                 |

## 제약

- POST Origin 검사의 의미(같은 origin 또는 `security.allowedOrigins`만 허용, Origin 없으면 `Sec-Fetch-Site`)는
  바꾸지 않는다. 다른 Origin은 계속 403이어야 한다(M-PO-4).
- `X-Forwarded-Proto`·`X-Forwarded-Host`를 기본으로 신뢰하지 않는다(위조 가능, `docs/server-adapters.md`).
- `ORIGIN` 미설정 시 기존 동작과 완전히 같아야 한다(로컬 `pnpm start`, 프록시 없는 배포).
- 403 응답 본문에 서버 내부 설정을 노출하지 않는다. 힌트는 서버 로그 쪽에 둔다.
- Cloudflare Workers는 엣지에서 `request.url`이 이미 public origin이라 대상이 아니다.

## 비목표

- 프록시 헤더를 신뢰하는 `trustProxy` 류 옵션(DC-PO-5에서 추후 판단).
- nginx 등 프록시 설정 자체의 변경이나 배포 자동화.
- 이미 생성된 앱의 자동 마이그레이션(`pnpm up state-surface`로는 `server.ts`가 바뀌지 않는다: 안내만 한다).
