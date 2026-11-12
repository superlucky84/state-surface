# 0.2.1 배포 수정 — 남은 테스트

기록일: 2026-11-12
상태: Todo — 0.2.1에서 기존 테스트(`format:check`, `check`, `test`)만 통과시키고 배포했다. 아래 새 테스트는 미작성.

0.2.1에서 고친 것(설계와 원인 기록은 커밋 `04c6ede`, `1057926`의 `docs/todo/proxy-origin/`,
`docs/todo/multi-instance-deploy.md`, `docs/bug/demo-cluster-memory-store.md`):

- Bun·Deno `serve({ origin })` — `engine/adapters/types.ts`의 `withOrigin()`
- 같은 host·다른 scheme POST 403에 프로세스당 1회 경고 — `engine/server/core/handler.ts`(`sameHostOtherScheme`)
- 템플릿 4종 `origin: process.env.ORIGIN || undefined`, `.env.example`의 `ORIGIN`·`SURFACE_SECRET` 안내
- `docs/server-adapters.md`의 프록시 뒤 배포·여러 인스턴스 절, 데모 README·저장소의 단일 프로세스 안내

## 단위 테스트

- [ ] `withOrigin()`: origin만 바뀌고 경로·쿼리 유지, method·headers·body(POST 스트림)·signal 유지, GET/HEAD는 body 없음,
      `origin`이 `undefined`/`''`이면 같은 Request 객체.
- [ ] `nodeRequest(req, res, origin)`(`engine/adapters/http.ts`): `origin` 지정 시 `ctx.url.origin`이 그 값, `//host` 경로가
      authority를 바꾸지 않음.
- [ ] handler 경고: `Origin: https://x` + 요청 `http://x` → 403 + `logger.warn` 1회(반복·동시 요청에도 1회), 다른 host Origin →
      403 + 경고 없음, 응답 상태·본문 변경 없음.
- [ ] `origin` 설정 후에도 다른 Origin·`Sec-Fetch-Site: cross-site`는 403(CSRF 회귀).

## 통합 테스트

- [ ] conformance 시나리오: 평문 http 서버에 `Host: public.example` + `Origin: https://public.example` POST →
      `origin: 'https://public.example'`이면 200(NDJSON `done`), 없으면 403. Node·Express·Bun·Deno(`pnpm test:adapters`).
- [ ] `pnpm test:scaffold`: 생성 앱의 `server.ts`에 `origin`이 있고, `ORIGIN` 없이·`ORIGIN=`(빈 값)으로 build·start·액션 정상.
- [ ] Deno 생성 앱에서 `process.env.ORIGIN`이 동작하는지(Deno 2 `process` 전역) 실제 실행으로 확인.
- [ ] 같은 커밋·lockfile을 두 환경에서 따로 빌드했을 때 buildId가 같은지 확인하고 `docs/server-adapters.md` 문구 확정.

## 수동 확인 (데모 서버, 0.2.1 재배포 후)

- [ ] `/ko/examples/actions` 버튼·폼, `/en/examples/search`, `/en/examples/chat`에서 콘솔 403 없음.
- [ ] 좋아요 연속 클릭이 매번 오름, 챗봇 `aaaaa`·`bbbb`·`cccc`가 모두 남음, 댓글 목록이 새로고침에도 같음.
- [ ] `ORIGIN`을 빼고 재시작하면 액션 403 + `pm2 logs`에 경고 1회. 확인 후 원복.
