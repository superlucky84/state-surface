# TLS 리버스 프록시 뒤 Origin 설정 — 설계

작성일: 2026-11-12
상태: Todo — DC-PO-1만 결정, 나머지는 제안(TBD)

요구사항: [REQUIREMENTS.md](./REQUIREMENTS.md)

## 1. 현재 동작 (0.2.0, 구현됨)

### 1.1 요청 URL의 origin

| 어댑터                                | origin 결정                                                                                        | `origin` 옵션                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Node `serve()` / `createNodeServer()` | `options.origin ?? (소켓 TLS ? 'https' : 'http') + '://' + Host` (`engine/adapters/http.ts:14-16`) | 있음 (`engine/adapters/node.ts`)       |
| Express `surface()`                   | 위와 같은 `nodeRequest()` 사용                                                                     | 있음 (`engine/adapters/express.ts:12`) |
| Bun `serve()`                         | `Bun.serve`가 만든 `request.url` 그대로 `handler.fetch(request)` (`engine/adapters/bun.ts:53-58`)  | 없음                                   |
| Deno `serve()`                        | `Deno.serve`가 만든 `request.url` 그대로 (`engine/adapters/deno.ts:52-56`)                         | 없음                                   |
| Workers `worker()`                    | 엣지의 `request.url` (이미 public origin)                                                          | 해당 없음                              |

TLS를 프록시가 종료하면 Node·Express·Bun·Deno 모두 `http://<Host>`가 된다.

### 1.2 POST Origin 검사

`engine/server/core/handler.ts:398-407`: POST에서 `Origin`이 있으면 `ctx.url.origin` 또는
`security.allowedOrigins`와 같아야 하고, 없으면 `Sec-Fetch-Site`가 `same-origin`/`none`/없음이어야 한다.
아니면 `HttpError(403, 'Cross-origin POST forbidden')` → `report()`(onError + `logger.error`) →
`text/html` 403 응답(`handler.ts:813-833`).

### 1.3 템플릿

`create-state-surface/templates/adapters/node/server.ts`는 `serve({ ...handler, manifest })`,
express는 `surface({ ...handler, manifest })`로 `origin`을 넘기지 않는다. `templates/base/env.example`에는
`PORT`, `BASE_PATH`만 있다. CLI는 템플릿을 `TEMPLATE_REF`(0.2.0 릴리스 커밋 SHA)에서 받으므로
레포 템플릿을 고쳐도 배포된 CLI가 만드는 앱은 바뀌지 않는다(`USER_PUBLISH.md` 3절).

## 2. 변경 설계

### 2.1 node·express 템플릿 (RQ-PO-1, DC-PO-1)

```ts
// templates/adapters/node/server.ts
// Behind a TLS-terminating proxy (nginx, a load balancer) set ORIGIN to the public origin,
// e.g. https://example.com: POST requests are checked against it.
await serve({ ...handler, manifest, origin: process.env.ORIGIN || undefined });
```

```ts
// templates/adapters/express/server.ts
app.use(surface({ ...handler, manifest, origin: process.env.ORIGIN || undefined }));
```

- `|| undefined`: `.env`에 `ORIGIN=`(빈 값)이 있으면 `process.env.ORIGIN`이 `''`이고, `nodeRequest()`의
  `origin ?? …`가 `''`을 그대로 써서 `new URL('')`이 모든 요청에서 throw한다(500). 빈 값은 미설정으로 취급한다.
- 값 형식: `scheme://host[:port]`, 경로 없음. 하위 경로는 `BASE_PATH`가 담당한다(`new URL(origin)`의 pathname은
  `nodeRequest()`가 덮어쓰므로 경로를 넣어도 무시된다. 문서에는 경로 없이 쓰라고 적는다).
- 값의 출처는 배포 설정(pm2 `ecosystem.config.cjs`의 env, systemd, 컨테이너 env, `.env`)이다. 재생성 시 덮어써지는
  `server.ts`에 하드코딩하지 않는다.

### 2.2 env.example·README (RQ-PO-2)

```dotenv
# Public origin when a proxy terminates TLS (nginx, a load balancer): POST requests are
# checked against it. Leave unset when the app itself serves the public URL.
# ORIGIN=https://example.com
```

- `templates/base/env.example`에 추가한다(주석 처리 상태: 빈 값 문제를 피한다).
- `templates/demo/README.md`, `templates/minimal/README.md`의 production 실행 안내와 `create-state-surface/README.md`에
  "프록시 뒤 배포" 한 단락을 둔다. 증상(액션 POST가 403)과 해결(`ORIGIN`)을 같이 적는다.
- base `env.example`은 cloudflare 앱에도 복사된다. Workers에는 해당 없음을 주석에 적거나(권장) adapter별로
  분리할지는 구현 시 판단한다(TBD 아님: 주석 한 줄로 충분하면 그대로 둔다).

### 2.3 Bun·Deno `origin` 옵션 (RQ-PO-4, DC-PO-2 제안)

- `serve(options & { origin?: string })`를 추가하고, `origin`이 있으면 `handler.fetch` 전에 요청 URL의 origin을
  바꾼다: `new Request(new URL(url.pathname + url.search, origin), request)`(본문 스트림·signal 유지 확인 필요).
  정적 파일 판정(`assetPath`)은 경로만 보므로 변경 전후 어느 쪽이어도 된다.
- 템플릿: bun은 `origin: process.env.ORIGIN || undefined`(이미 `env: process.env`를 넘김),
  deno는 `origin: Deno.env.get('ORIGIN') || undefined`.
- 대안: 어댑터가 `env.ORIGIN`을 직접 읽는 방식. 명시적 옵션과 템플릿 노출이 Node·Express와 일관되므로 제안하지 않는다.
- 엔진 변경이라 `state-surface` 릴리스가 필요하고, Bun·Deno 템플릿 변경은 그 릴리스를 요구한다(구버전 엔진에서는
  타입 오류). CLI 기본 버전(`^0.2.0`)을 새 버전으로 올릴지는 DC-PO-4에서 정한다.

### 2.4 403 진단 힌트 (RQ-PO-5, DC-PO-3 제안)

- 조건: POST Origin 검사 실패이면서 `Origin`의 host가 `ctx.url.host`와 같고 scheme만 다를 때
  (`https://x` vs `http://x`). TLS 종료 프록시 설정 누락의 강한 신호다.
- 동작: 프로세스당 1회 `logger.warn`으로
  `POST Origin https://x does not match the server origin http://x: behind a TLS-terminating proxy pass the public origin to the adapter (origin / ORIGIN). See docs/server-adapters.md.`
  응답 본문·상태는 그대로(403, 같은 메시지). 다른 host의 403은 공격일 수 있으므로 힌트를 남기지 않는다.
- dev 서버에서도 같은 경고를 보낸다(dev를 프록시 뒤에 두는 경우).
- 대안: 응답 본문에 힌트 포함 — 서버 설정을 외부에 알리게 되므로 제안하지 않는다.

### 2.5 릴리스 (RQ-PO-3)

`USER_PUBLISH.md` 절차를 따른다. 순서 제약: 템플릿 수정 커밋이 GitHub에 push된 뒤 그 SHA로 `TEMPLATE_REF`를
바꾸고, 그 다음 `create-state-surface`를 publish한다(ref가 없으면 `npx` 실행이 404).

## 3. 결정 체크리스트

- [x] DC-PO-1 (2026-11-12 사용자 결정): node·express는 엔진 변경 없이 템플릿에서 `origin: process.env.ORIGIN`을 넘기고,
      `env.example`로 안내한다. 근거: 두 어댑터가 0.2.0에서 이미 `origin`을 받아 `state-surface` 재배포가 필요 없고,
      값은 재생성에도 남는 배포 설정(env)에 둘 수 있다. 빈 값 처리(`|| undefined`)는 2.1의 구현 세부로 포함한다.
- [ ] DC-PO-2: Bun·Deno에 `origin` 옵션 추가 여부와 방식. 제안: 2.3의 명시적 옵션 + 템플릿 노출. TBD.
- [ ] DC-PO-3: 403 힌트의 형태. 제안: 같은 host·다른 scheme일 때 프로세스당 1회 `logger.warn`, 응답은 그대로. TBD.
- [ ] DC-PO-4: 릴리스 묶음. (a) node·express 템플릿만 `create-state-surface@0.2.1`로 먼저 배포하고 Bun·Deno·힌트는
      `state-surface@0.2.1` + `create-state-surface@0.2.2`로 나중에, (b) 엔진 변경까지 모아 한 번에. 제안: (a) — 가장 흔한
      Node 배포의 403을 빨리 없앤다. TBD.
- [ ] DC-PO-5: `X-Forwarded-Proto`/`X-Forwarded-Host`를 읽는 opt-in 옵션(`trustProxy` 류). 제안: 이번 범위에서 제외
      (비목표), 요청이 생기면 신뢰 프록시 지정 방식과 함께 다시 검토. TBD.

## 4. 검증 연결

| 결정·요구            | 검증                                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| DC-PO-1, RQ-PO-1     | `http.ts` origin 단위 테스트, scaffold 테스트의 `server.ts` 내용 확인, M-PO-1·2·5 |
| RQ-PO-2              | scaffold 산출물의 `.env.example` 확인, M-PO-1                                     |
| RQ-PO-3              | `npx create-state-surface@0.2.1` 생성물 확인, M-PO-1                              |
| DC-PO-2, RQ-PO-4     | Bun·Deno conformance 시나리오(프록시 흉내: http 서버 + https Origin), M-PO-6      |
| DC-PO-3, RQ-PO-5     | handler 단위 테스트(경고 1회, 다른 host는 경고 없음), M-PO-3                      |
| 제약(검사 의미 유지) | 다른 Origin 403 회귀 테스트, M-PO-4                                               |
