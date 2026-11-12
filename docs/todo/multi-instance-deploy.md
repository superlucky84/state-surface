# 여러 프로세스·인스턴스 배포 안내 — 메모

기록일: 2026-11-12
상태: Todo — 메모(문서 보강 과제), 미착수

## 배경

데모 서버에서 pm2 cluster 2개 × 데모의 메모리 저장소 때문에 좋아요·챗봇이 번갈아 깨졌다
([docs/bug/demo-cluster-memory-store.md](../bug/demo-cluster-memory-store.md)). 실제 서비스는 보통 여러 프로세스·서버로
띄우므로, 엔진이 그 구성에서 안전한지와 사용자가 무엇을 맞춰야 하는지 확인했다.

## 확인한 사실 (코드 기준, 2026-11-12)

- **엔진은 요청 사이에 사용자·세션 상태를 프로세스 메모리에 두지 않는다**(DC-10). `engine/server`, `engine/adapters`의
  `Map`/`Set`은 요청 단위(`projection.ts`, `ssrRenderer.ts`, `core/context.ts`)이거나 빌드에서 정해지는 값의 캐시
  (`core/handler.ts`의 pages·staticPaths, `secrets.ts`의 키 파생 캐시)다. 프로세스 수와 무관하게 같게 동작한다.
- **root secret**(deferred slot 토큰, flash 쿠키 — IC-09): 런타임 `SURFACE_SECRET` → 없으면 빌드에 박힌 secret
  (`engine/server/core/handler.ts:279`). 빌드 secret은 빌드 시 `STATE_SURFACE_BUILD_SECRET`이 없으면 **빌드마다 랜덤**
  (`engine/vite.ts:142-144`). 회전은 `SURFACE_SECRET_PREVIOUS`(복호화·검증 전용).
- **buildId**: production 빌드는 클라이언트 에셋 manifest의 sha256 앞 16자(`engine/vite.ts:453-456`)라 같은 소스·의존성이면
  서버마다 따로 빌드해도 같은 값일 가능성이 높다(빌드 결정성에 의존, 미검증).

## 결론

- 같은 빌드 산출물을 여러 프로세스·서버에 배포하면 문제없다(데모 서버의 pm2 cluster가 이 경우였다 — secret 공유).
- 서버마다 따로 빌드하면 buildId는 같아도 secret이 달라질 수 있다. 그러면 409 새로고침 없이 **다른 인스턴스가 만든 deferred
  slot 토큰(`/_surface/island`)과 flash 쿠키(JS 없는 PRG 결과)를 읽지 못한다**. 로드밸런서가 요청을 섞으면 간헐적으로 실패해
  원인을 찾기 어렵다.
- 앱 상태(세션, 좋아요, 대화 등)는 앱이 공유 저장소(DB, Redis)에 둔다. 어떤 서버 프레임워크든 같은 전제다.

## 해야 할 일

- [ ] `docs/server-adapters.md`에 "여러 프로세스·인스턴스 배포" 절 추가:
      ① 빌드는 한 번, 산출물을 배포 ② 서버마다 빌드하거나 빌드를 갈아끼울 때는 모든 인스턴스에 같은 `SURFACE_SECRET`(≥ 32바이트)
      ③ secret 회전은 `SURFACE_SECRET_PREVIOUS` ④ 앱 상태는 공유 저장소 ⑤ 롤링 배포 중 다른 buildId끼리는 409 후 새로고침(정상)
- [ ] README의 `SURFACE_SECRET` 언급(현재 deferred slot 설명 한 곳)에 위 절 링크.
- [ ] 생성 앱 `templates/base/env.example`에 주석 처리된 `SURFACE_SECRET` 안내(여러 인스턴스·따로 빌드할 때 필요).
      proxy-origin의 `ORIGIN` 안내와 같은 변경에 묶을 수 있다([proxy-origin/IMPLEMENT.md](./proxy-origin/IMPLEMENT.md) Phase 1).
- [ ] 데모 템플릿의 메모리 저장소 경고는 bug 리포트의 해결 방안 3에서 다룬다(중복 기록하지 않음).
- [ ] (검토) 따로 빌드한 인스턴스끼리 secret이 다를 때 토큰 복호화 실패를 운영자가 알 수 있게 로그 힌트를 둘지. TBD.
- [ ] (검증) 같은 커밋·lockfile을 두 환경에서 빌드했을 때 buildId가 같은지 확인하고 문서 문구를 확정.
